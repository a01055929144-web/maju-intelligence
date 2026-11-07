import { supabaseRequest } from "../store";
import type { PurchaseCostChange, PurchaseCostRepository } from "../../application/pricing/update-purchase-cost";
import { aliasKey, selectPurchaseCostCandidate, type CostProduct, type PurchaseCostCandidate } from "../../domains/pricing/purchase-cost";
import { convertedUnitCost } from "../../domains/product/catalog-import";

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const koreaDay = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sameUnit = (supplier: Row, product: Row) => {
  const unit = String(product.sales_unit || "").trim().toLocaleLowerCase("ko");
  return Boolean(unit) && String(supplier.raw_unit || "").trim().toLocaleLowerCase("ko") === unit;
};

async function pages(path: string) {
  const result: Row[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const rows = await supabaseRequest<Row[]>(`${path}&limit=500&offset=${offset}`);
    result.push(...rows);
    if (rows.length < 500) return result;
  }
  throw new Error("상품이 10,000개를 넘어 검색 범위를 좁혀야 합니다.");
}

async function patchOne(path: string, body: Row) {
  const rows = await supabaseRequest<Row[]>(path, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (rows.length !== 1) throw new Error("다른 사용자가 매입가를 바꿨습니다. 새로고침 후 다시 시도해 주세요.");
}

export const purchaseCostRepository: PurchaseCostRepository = {
  async list(companyId) {
    const [catalog, matches, supplierProducts, suppliers] = await Promise.all([
      pages(`product_catalog?select=id,product_code,canonical_name,spec_value,spec_unit,sales_unit,purchase_price,tax_type,created_at&company_id=eq.${enc(companyId)}&order=id`),
      pages(`supplier_product_matches?select=product_catalog_id,supplier_product_id,match_status,purchase_to_sales_ratio,conversion_confirmed&company_id=eq.${enc(companyId)}&match_status=in.(auto,confirmed)&order=supplier_product_id`),
      pages(`supplier_products?select=id,supplier_id,supplier_code,raw_name,raw_spec,raw_unit,latest_cost,cost_confirmed&company_id=eq.${enc(companyId)}&is_active=eq.true&order=id`),
      pages(`product_suppliers?select=id,name&company_id=eq.${enc(companyId)}&order=id`),
    ]);
    const bySupplierProduct = new Map(supplierProducts.map((row) => [String(row.id), row]));
    const supplierNames = new Map(suppliers.map((row) => [String(row.id), String(row.name)]));
    const byCatalog = new Map<string, Row[]>();
    for (const match of matches) {
      const list = byCatalog.get(String(match.product_catalog_id)) || [];
      const supplier = bySupplierProduct.get(String(match.supplier_product_id));
      if (supplier) list.push({ ...supplier, match_status: match.match_status, purchase_to_sales_ratio: match.purchase_to_sales_ratio, conversion_confirmed: match.conversion_confirmed });
      byCatalog.set(String(match.product_catalog_id), list);
    }
    const products: CostProduct[] = catalog.flatMap((row) => {
      const base = {
        id: String(row.id), code: String(row.product_code || ""), name: String(row.canonical_name || ""),
        spec: [row.spec_value, row.spec_unit].filter((value) => value != null && value !== "").join(""),
        unit: String(row.sales_unit || ""), cost: Number(row.purchase_price) || 0,
        createdAt: String(row.created_at || ""),
        ...(row.tax_type === "taxable" || row.tax_type === "exempt" ? { taxType: row.tax_type as "taxable" | "exempt" } : {}),
      };
      const linked = byCatalog.get(base.id) || [];
      return linked.length ? linked.map((supplier) => ({ ...base, supplierProductId: String(supplier.id), supplierCode: String(supplier.supplier_code || ""), supplierName: supplierNames.get(String(supplier.supplier_id)) || "", supplierRawKey: aliasKey(String(supplier.raw_name || ""), String(supplier.raw_spec || ""), String(supplier.raw_unit || "")) })) : [base];
    });
    const changes = catalog.map((row) => {
      const productId = String(row.id);
      const linked = byCatalog.get(productId) || [];
      const change = selectPurchaseCostCandidate(productId, Number(row.purchase_price) || 0, linked.map((supplier) => {
        const unitsEqual = sameUnit(supplier, row);
        const rawCost = supplier.latest_cost == null ? null : Number(supplier.latest_cost);
        const cost = rawCost == null ? null : unitsEqual ? rawCost : convertedUnitCost(rawCost, supplier.purchase_to_sales_ratio == null ? undefined : Number(supplier.purchase_to_sales_ratio), supplier.conversion_confirmed === true) ?? null;
        return {
          id: String(supplier.id),
          supplierName: supplierNames.get(String(supplier.supplier_id)) || "",
          latestCost: cost,
          confirmed: supplier.cost_confirmed === true && supplier.match_status === "confirmed"
        };
      }));
      if (change) return change;
      const review = linked.map((supplier) => {
        const reviewReason = supplier.match_status !== "confirmed" ? "매입처 상품 연결 확인 필요" : supplier.cost_confirmed !== true ? "원가 확인 필요" : !sameUnit(supplier, row) && supplier.conversion_confirmed !== true ? "단위 환산 확인 필요" : "";
        return { supplier, reviewReason };
      }).find(({ supplier, reviewReason }) => supplier.latest_cost != null && Number(supplier.latest_cost) > 0 && reviewReason);
      return review ? {
        productId,
        supplierProductId: String(review.supplier.id),
        supplierName: supplierNames.get(String(review.supplier.supplier_id)) || "",
        cost: Number(row.purchase_price) || 0,
        direction: "review" as const,
        reviewReason: review.reviewReason
      } : null;
    }).filter((change): change is PurchaseCostCandidate => change != null);
    return { changes, products, suppliers: Array.from(supplierNames.values()) };
  },

  async save(companyId, actorName, change: PurchaseCostChange) {
    if (!uuid.test(change.productId) || (change.supplierProductId && !uuid.test(change.supplierProductId))) throw new Error("품목 ID를 확인해 주세요.");
    const productPath = `product_catalog?company_id=eq.${enc(companyId)}&id=eq.${enc(change.productId)}`;
    const [product] = await supabaseRequest<Row[]>(`${productPath}&select=id,purchase_price,sales_unit`);
    if (!product) throw new Error("다른 회사의 상품이거나 삭제된 상품입니다.");
    const oldCost = Number(product.purchase_price) || 0;
    if (oldCost !== change.expectedCost) throw new Error("매입가가 이미 변경됐습니다. 새로고침 후 다시 시도해 주세요.");
    if (oldCost === change.cost) return;
    let supplier: Row | undefined;
    let supplierCost = change.cost;
    let importId = "";
    if (change.supplierProductId) {
      const [match] = await supabaseRequest<Row[]>(`supplier_product_matches?select=id,purchase_to_sales_ratio,conversion_confirmed&company_id=eq.${enc(companyId)}&product_catalog_id=eq.${enc(change.productId)}&supplier_product_id=eq.${enc(change.supplierProductId)}&match_status=in.(auto,confirmed)`);
      if (!match) throw new Error("매입처 상품 연결을 확인해 주세요.");
      [supplier] = await supabaseRequest<Row[]>(`supplier_products?select=id,supplier_id,raw_unit,latest_cost,cost_confirmed,last_seen_date,updated_at&company_id=eq.${enc(companyId)}&id=eq.${enc(change.supplierProductId)}`);
      if (!supplier) throw new Error("매입처 상품을 찾지 못했습니다.");
      if (!sameUnit(supplier, product)) {
        const ratio = Number(match.purchase_to_sales_ratio);
        if (match.conversion_confirmed !== true || !Number.isFinite(ratio) || ratio <= 0) throw new Error("매입처 상품의 단위 환산을 먼저 확인해 주세요.");
        supplierCost = Number((change.cost * ratio).toFixed(2));
        if (!Number.isFinite(supplierCost) || supplierCost > 999_999_999_999.99 || Math.abs(supplierCost / ratio - change.cost) > 0.005) throw new Error("이 단위 환산으로는 매입처 원가를 정확히 저장할 수 없습니다. 환산 비율을 확인해 주세요.");
      }
      const [run] = await supabaseRequest<Row[]>("product_catalog_imports?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, supplier_id: supplier.supplier_id, file_name: (change.fileName || "직접 변경").slice(0, 255), mapping: {}, total_rows: 1, updated_count: 1, status: "processing", created_by_name: actorName }) });
      importId = String(run?.id || "");
      if (!importId) throw new Error("매입가 변경 이력을 시작하지 못했습니다.");
    }
    const supplierPath = supplier ? `supplier_products?company_id=eq.${enc(companyId)}&id=eq.${enc(change.supplierProductId!)}&latest_cost=${supplier.latest_cost == null ? "is.null" : `eq.${enc(String(supplier.latest_cost))}`}` : "";
    let supplierUpdated = false;
    let productUpdated = false;
    try {
      if (supplier) { await patchOne(supplierPath, { latest_cost: supplierCost, cost_confirmed: true, last_seen_date: koreaDay(), updated_at: new Date().toISOString() }); supplierUpdated = true; }
      await patchOne(`${productPath}&purchase_price=eq.${enc(String(oldCost))}`, { purchase_price: change.cost, updated_at: new Date().toISOString() });
      productUpdated = true;
      if (supplier) {
        await supabaseRequest("supplier_product_cost_history", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: companyId, supplier_product_id: supplier.id, import_id: importId, price_date: koreaDay(), purchase_price: supplierCost }) });
        await supabaseRequest(`product_catalog_imports?company_id=eq.${enc(companyId)}&id=eq.${enc(importId)}`, { method: "PATCH", body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString() }) });
      }
    } catch (error) {
      const failed: string[] = [];
      if (importId) await supabaseRequest(`supplier_product_cost_history?company_id=eq.${enc(companyId)}&import_id=eq.${enc(importId)}`, { method: "DELETE" }).catch(() => failed.push("이력"));
      if (productUpdated) await patchOne(`${productPath}&purchase_price=eq.${enc(String(change.cost))}`, { purchase_price: oldCost }).catch(() => failed.push("상품 원가"));
      if (supplier && supplierUpdated) await patchOne(`supplier_products?company_id=eq.${enc(companyId)}&id=eq.${enc(change.supplierProductId!)}&latest_cost=eq.${enc(String(supplierCost))}`, { latest_cost: supplier.latest_cost, cost_confirmed: supplier.cost_confirmed, last_seen_date: supplier.last_seen_date, updated_at: supplier.updated_at }).catch(() => failed.push("매입처 원가"));
      if (importId) await supabaseRequest(`product_catalog_imports?company_id=eq.${enc(companyId)}&id=eq.${enc(importId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error_message: String(error).slice(0, 500), completed_at: new Date().toISOString() }) }).catch(() => failed.push("가져오기 기록"));
      throw new Error(`${error instanceof Error ? error.message : "저장 실패"}${failed.length ? ` · 자동 복구 실패(${failed.join(", ")}). 해당 상품을 확인해 주세요.` : " · 변경 전 값으로 복구했습니다."}`);
    }
  },
};
