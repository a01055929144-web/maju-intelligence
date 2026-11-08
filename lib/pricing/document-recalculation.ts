import { supabaseRequest } from "../store";
import type { DocumentDraft } from "../../domains/pricing/document";
import { changedCostEvents, documentRecalculation, type ProductPriceChange } from "../../domains/pricing/document-recalculation";

type CostRow = { id: string; supplier_product_id: string; purchase_price: number; created_at: string;
  import_id: string; source: { supplier_id: string; mapping: { contract?: string } } | null };
const costFields = "id,supplier_product_id,purchase_price,created_at,import_id,source:product_catalog_imports(supplier_id,mapping)";
type VersionRow = { id: string; versions: { published_at: string; content: { lines: { productId: string }[] } }[] };
const enc = encodeURIComponent;
const parts = <T,>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 100) }, (_, i) => rows.slice(i * 100, i * 100 + 100));

async function pages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; offset <= 10_000; offset += 500) {
    const page = await supabaseRequest<T[]>(`${path}&limit=500&offset=${offset}`);
    all.push(...page);
    // ponytail: complete history up to 10k rows per product batch; aggregate in SQL if exceeded.
    if (all.length > 10_000) throw new Error("문서 가격 이력이 많아 상태를 계산하지 못했습니다. 조회 범위를 줄여 주세요.");
    if (page.length < 500) return all;
  }
  throw new Error("문서 가격 이력을 끝까지 확인하지 못했습니다.");
}

/** Receipt prices are not current-cost changes when the atomic batch proves no prices were applied. */
async function historyOnlyImports(company: string, rows: CostRow[]) {
  const sources = new Map(rows.filter(row => row.source?.mapping?.contract === "purchase-cost-date-v2").map(row => [row.import_id, row.source!]));
  const ignored = new Set<string>();
  for (const batch of parts(Array.from(sources))) {
    const filter = batch.map(([id, source]) => `supplier_import_ids->>${source.supplier_id}.eq.${id}`).join(",");
    const records = await pages<{ supplier_import_ids: Record<string, string>; product_snapshots: Record<string, unknown>;
      supplier_snapshots: Record<string, unknown>; recalc_run_id: string | null; history_only_product_count: number }>(
      `purchase_cost_date_batches_v2?company_id=eq.${company}&status=eq.completed&or=${enc(`(${filter})`)}&select=supplier_import_ids,product_snapshots,supplier_snapshots,recalc_run_id,history_only_product_count&order=created_at,id`,
    );
    for (const [id, source] of batch) {
      const record = records.find(row => row.supplier_import_ids[source.supplier_id] === id);
      if (!record) throw new Error("문서 매입 이력의 현재가 반영 상태를 확인하지 못했습니다. 다시 불러와 주세요.");
      if (record.recalc_run_id === null && record.history_only_product_count > 0 &&
        Object.keys(record.product_snapshots).length === 0 && Object.keys(record.supplier_snapshots).length === 0) ignored.add(id);
    }
  }
  return ignored;
}

/** Only documents already authorized by pricing_p1(list) may enter this read model. */
export async function withDocumentRecalculations<T>(companyId: string, result: T): Promise<T> {
  if (!result || typeof result !== "object" || !("items" in result) || !Array.isArray(result.items)) throw new Error("문서 목록을 확인하지 못했습니다.");
  const documents = result.items as DocumentDraft[];
  if (!documents.length) return result;
  const company = enc(companyId);
  const versions = await supabaseRequest<VersionRow[]>(
    `pricing_documents?company_id=eq.${company}&id=in.(${documents.map(d => enc(d.id)).join(",")})&select=id,versions:pricing_document_versions(published_at,content)&versions.order=version.desc&versions.limit=1&limit=50`,
  );
  if (versions.length !== documents.length) throw new Error("문서가 변경됐습니다. 목록을 다시 불러와 주세요.");
  const published = new Map(versions.map(row => [row.id, row.versions[0]]));
  const active = versions.flatMap(row => row.versions);
  const changes: ProductPriceChange[] = [];
  if (active.length) {
    if (active.some(v => !Number.isFinite(Date.parse(v.published_at)))) throw new Error("문서 게시 시각을 확인하지 못했습니다.");
    const since = new Date(Math.min(...active.map(v => Date.parse(v.published_at)))).toISOString();
    const ids = Array.from(new Set(active.flatMap(v => v.content.lines.map(line => line.productId))));
    for (const batch of parts(ids)) {
      const filter = batch.map(enc).join(",");
      const [recalculations, matches] = await Promise.all([
        pages<{ product_id: string; before_value: { price: number | null; applied_cost: number | null }; after_value: { price: number | null; applied_cost: number | null }; run: { created_at: string } }>(
          `price_recalc_changes?company_id=eq.${company}&product_id=in.(${filter})&select=product_id,before_value,after_value,run:price_recalc_runs!inner(created_at)&run.company_id=eq.${company}&run.created_at=gt.${enc(since)}&order=run_id,product_id`,
        ),
        pages<{ product_catalog_id: string; supplier_product_id: string }>(
          `supplier_product_matches?company_id=eq.${company}&product_catalog_id=in.(${filter})&match_status=in.(auto,confirmed)&select=product_catalog_id,supplier_product_id&order=product_catalog_id,supplier_product_id`,
        ),
      ]);
      for (const row of recalculations) if (row.before_value.price !== row.after_value.price || row.before_value.applied_cost !== row.after_value.applied_cost) changes.push({ productId: row.product_id, changedAt: row.run.created_at });
      const suppliers = Array.from(new Set(matches.map(m => m.supplier_product_id)));
      for (const supplierBatch of parts(suppliers)) {
        const supplierFilter = supplierBatch.map(enc).join(",");
        const [history, baselines] = await Promise.all([
          pages<CostRow>(`supplier_product_cost_history?company_id=eq.${company}&supplier_product_id=in.(${supplierFilter})&created_at=gt.${enc(since)}&select=${costFields}&order=created_at,id`),
          supabaseRequest<{ id: string; baseline: CostRow[] }[]>(`supplier_products?company_id=eq.${company}&id=in.(${supplierFilter})&select=id,baseline:supplier_product_cost_history(${costFields})&baseline.company_id=eq.${company}&baseline.created_at=lte.${enc(since)}&baseline.order=created_at.desc,id.desc&baseline.limit=1&limit=100`),
        ]);
        const ignored = await historyOnlyImports(company, [...history, ...baselines.flatMap(row => row.baseline)]);
        for (const supplierId of supplierBatch) {
          let baseline = baselines.find(row => row.id === supplierId)?.baseline[0];
          if (baseline && ignored.has(baseline.import_id)) {
            const older = await pages<CostRow>(`supplier_product_cost_history?company_id=eq.${company}&supplier_product_id=eq.${enc(supplierId)}&created_at=lte.${enc(since)}&select=${costFields}&order=created_at.desc,id.desc`);
            const olderIgnored = await historyOnlyImports(company, older);
            baseline = older.find(row => !olderIgnored.has(row.import_id));
          }
          const events = changedCostEvents(history.filter(row => row.supplier_product_id === supplierId && !ignored.has(row.import_id)), baseline?.purchase_price);
          for (const match of matches.filter(row => row.supplier_product_id === supplierId)) for (const event of events) changes.push({ productId: match.product_catalog_id, changedAt: event.created_at });
        }
      }
    }
  }
  return { ...result, items: documents.map(document => {
    const version = published.get(document.id);
    return { ...document, recalculation: documentRecalculation(version ? { publishedAt: version.published_at, productIds: version.content.lines.map(line => line.productId) } : undefined, changes) };
  }) };
}
