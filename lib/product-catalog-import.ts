import {
  buildSupplierProductWrite,
  planSupplierMatchRefresh,
  rankProductCandidates,
  type CatalogMapping,
  type ParsedProduct,
} from "../domains/product/catalog-import";
import { supabaseRequest as db } from "./store";

type Json = Record<string, unknown>;
const enc = encodeURIComponent;
const chunks = <T>(rows: T[], size = 300) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

export type SupplierProductAdminItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  rawName: string;
  rawSpec?: string;
  rawUnit?: string;
  latestCost?: number;
  costConfirmed: boolean;
  barcode?: string;
  productCode?: string;
  matchStatus: "auto" | "candidate" | "confirmed" | "unmatched";
  matchedCatalogId?: string;
  matchedCatalogName?: string;
};
export async function listProductImportWorkspace(companyId: string) {
  const [suppliers, products, matches, catalog] = await Promise.all([
    db<Array<{ id: string; name: string }>>(
      `product_suppliers?select=id,name&company_id=eq.${enc(companyId)}&order=name`,
    ),
    db<Array<Record<string, unknown>>>(
      `supplier_products?select=id,supplier_id,supplier_code,barcode,raw_name,raw_spec,raw_unit,latest_cost,cost_confirmed,parsed_name,parsed_brand,parsed_origin,parsed_spec_value,parsed_spec_unit,parsed_pack_quantity&company_id=eq.${enc(companyId)}&is_active=eq.true&order=updated_at.desc&limit=3000`,
    ),
    db<
      Array<{
        supplier_product_id: string;
        product_catalog_id: string;
        match_status: "auto" | "candidate" | "confirmed";
        candidate_rank: number | null;
      }>
    >(
      `supplier_product_matches?select=supplier_product_id,product_catalog_id,match_status,candidate_rank&company_id=eq.${enc(companyId)}&order=candidate_rank.asc.nullslast`,
    ),
    db<Array<Record<string, unknown>>>(
      `product_catalog?select=id,canonical_name,purchase_product_name,brand_name,origin_name,spec_value,spec_unit,purchase_unit,barcodes,is_active&company_id=eq.${enc(companyId)}&order=updated_at.desc&limit=3000`,
    ),
  ]);
  const supplierNames = new Map(suppliers.map((x) => [x.id, x.name]));
  const catalogNames = new Map(
    catalog.map((x) => [
      String(x.id),
      String(x.canonical_name || x.purchase_product_name || ""),
    ]),
  );
  const matchMap = new Map<string, (typeof matches)[number]>();
  for (const m of matches) {
    if (!matchMap.has(m.supplier_product_id) || m.match_status !== "candidate")
      matchMap.set(m.supplier_product_id, m);
  }
  return {
    suppliers,
    catalogCount: catalog.length,
    items: products.map((p) => {
      const m = matchMap.get(String(p.id));
      return {
        id: String(p.id),
        supplierId: String(p.supplier_id),
        supplierName: supplierNames.get(String(p.supplier_id)) || "-",
        rawName: String(p.raw_name),
        rawSpec: p.raw_spec ? String(p.raw_spec) : undefined,
        rawUnit: p.raw_unit ? String(p.raw_unit) : undefined,
        latestCost: p.latest_cost == null ? undefined : Number(p.latest_cost),
        costConfirmed: Boolean(p.cost_confirmed),
        barcode: p.barcode ? String(p.barcode) : undefined,
        productCode: p.supplier_code ? String(p.supplier_code) : undefined,
        matchStatus: m?.match_status || "unmatched",
        matchedCatalogId: m?.product_catalog_id,
        matchedCatalogName: m
          ? catalogNames.get(m.product_catalog_id)
          : undefined,
      } satisfies SupplierProductAdminItem;
    }),
  };
}

export async function saveProductCatalogImport(input: {
  companyId: string;
  createdByName: string;
  fileName: string;
  supplierName: string;
  mapping: CatalogMapping;
  products: ParsedProduct[];
  excludedCount: number;
  warnings: string[];
}) {
  const supplierName = input.supplierName.trim();
  if (!supplierName) throw new Error("유통사명을 입력해 주세요.");
  if (!input.products.length) throw new Error("저장할 정상 품목이 없습니다.");
  const supplierRows = await db<Array<{ id: string }>>(
    `product_suppliers?on_conflict=company_id,name`,
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        company_id: input.companyId,
        name: supplierName,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  const supplierId = supplierRows[0]?.id;
  if (!supplierId) throw new Error("유통사를 저장하지 못했습니다.");
  const existing = await db<Array<{ source_fingerprint: string }>>(
    `supplier_products?select=source_fingerprint&company_id=eq.${enc(input.companyId)}&supplier_id=eq.${enc(supplierId)}`,
  );
  const existingKeys = new Set(existing.map((x) => x.source_fingerprint));
  const importRows = await db<Array<{ id: string }>>(
    `product_catalog_imports`,
    {
      method: "POST",
      body: JSON.stringify({
        company_id: input.companyId,
        supplier_id: supplierId,
        file_name: input.fileName,
        mapping: input.mapping,
        total_rows: input.products.length + input.excludedCount,
        created_count: input.products.filter(
          (p) => !existingKeys.has(p.sourceFingerprint),
        ).length,
        updated_count: input.products.filter((p) =>
          existingKeys.has(p.sourceFingerprint),
        ).length,
        excluded_count: input.excludedCount,
        warning_count: input.warnings.length,
        status: "processing",
        created_by_name: input.createdByName,
      }),
    },
  );
  const importId = importRows[0]?.id;
  if (!importId) throw new Error("업로드 이력을 만들지 못했습니다.");
  try {
    const payload = input.products.map((product) =>
      buildSupplierProductWrite(input.companyId, supplierId, product),
    );
    let saved: Array<Record<string, unknown>> = [];
    for (const part of chunks(payload)) {
      saved = saved.concat(
        await db<Array<Record<string, unknown>>>(
          `supplier_products?on_conflict=company_id,supplier_id,source_fingerprint`,
          {
            method: "POST",
            headers: {
              Prefer: "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify(part),
          },
        ),
      );
    }
    const idByKey = new Map(
      saved.map((r) => [String(r.source_fingerprint), String(r.id)]),
    );
    const histories: Json[] = [],
      observations: Json[] = [];
    for (const p of input.products) {
      const id = idByKey.get(p.sourceFingerprint);
      if (!id) continue;
      histories.push({
        company_id: input.companyId,
        supplier_product_id: id,
        import_id: importId,
        price_date: p.date || new Date().toISOString().slice(0, 10),
        purchase_price: p.cost,
        reference_sales_min: p.salesMin || null,
        reference_sales_median: p.salesMedian || null,
      });
      for (const o of p.observations) {
        if (o.unitPrice < 0) continue;
        observations.push({
          company_id: input.companyId,
          buyer_name: o.buyerName,
          buyer_code: o.buyerCode || null,
          customer_id: null,
          supplier_product_id: id,
          product_catalog_id: null,
          import_id: importId,
          price_date: o.date,
          unit_price: o.unitPrice,
          quantity: o.quantity == null ? null : Math.max(0, o.quantity),
          source_row_key: o.rowKey,
        });
      }
    }
    for (const part of chunks(histories))
      await db(
        `supplier_product_cost_history?on_conflict=company_id,supplier_product_id,import_id,price_date`,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(part),
        },
      );
    for (const part of chunks(observations))
      await db(
        `product_price_observations?on_conflict=company_id,import_id,source_row_key`,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(part),
        },
      );
    const supplierProductIds = Array.from(idByKey.values());
    const existingMatches = supplierProductIds.length
      ? await db<
          Array<{
            match_status: "auto" | "candidate" | "confirmed" | "rejected";
            product_catalog_id: string;
            supplier_product_id: string;
          }>
        >(
          `supplier_product_matches?select=supplier_product_id,product_catalog_id,match_status&company_id=eq.${enc(input.companyId)}&supplier_product_id=in.(${supplierProductIds.map(enc).join(",")})`,
        )
      : [];
    const { protectedSupplierIds, rejectedCatalogIds, unresolvedSupplierIds } =
      planSupplierMatchRefresh(
        supplierProductIds,
        existingMatches.map((match) => ({
          matchStatus: match.match_status,
          productCatalogId: match.product_catalog_id,
          supplierProductId: match.supplier_product_id,
        })),
      );
    if (unresolvedSupplierIds.length) {
      await db(
        `supplier_product_matches?company_id=eq.${enc(input.companyId)}&supplier_product_id=in.(${unresolvedSupplierIds.map(enc).join(",")})&match_status=eq.candidate`,
        { method: "DELETE", headers: { Prefer: "return=minimal" } },
      );
    }
    const catalog = await db<Array<Record<string, unknown>>>(
      `product_catalog?select=id,canonical_name,purchase_product_name,brand_name,origin_name,spec_value,spec_unit,purchase_unit,barcodes&company_id=eq.${enc(input.companyId)}&is_active=eq.true`,
    );
    const matches: Json[] = [];
    for (const p of input.products) {
      const sid = idByKey.get(p.sourceFingerprint);
      if (!sid || protectedSupplierIds.has(sid)) continue;
      const rejected = rejectedCatalogIds.get(sid) || new Set<string>();
      const ranked = rankProductCandidates(
        p,
        catalog.map((c) => ({
          id: String(c.id),
          record: c,
            barcodes: Array.isArray(c.barcodes) ? c.barcodes.map(String) : [],
            brand: c.brand_name ? String(c.brand_name) : undefined,
            name: String(c.canonical_name || c.purchase_product_name || ""),
            origin: c.origin_name ? String(c.origin_name) : undefined,
            specUnit: c.spec_unit ? String(c.spec_unit) : undefined,
            specValue: c.spec_value == null ? undefined : Number(c.spec_value),
            unit: c.purchase_unit ? String(c.purchase_unit) : undefined,
        })),
        rejected,
      );
      ranked.forEach((candidate, i) =>
        matches.push({
          company_id: input.companyId,
          supplier_product_id: sid,
          product_catalog_id: candidate.target.id,
          match_status: candidate.result.auto && i === 0 ? "auto" : "candidate",
          candidate_rank: candidate.result.auto && i === 0 ? null : i + 1,
          match_score: candidate.result.score,
          name_matches: candidate.result.flags?.name || false,
          brand_matches: candidate.result.flags?.brand || false,
          origin_matches: candidate.result.flags?.origin || false,
          spec_matches: candidate.result.flags?.spec || false,
          unit_matches: candidate.result.flags?.unit || false,
        }),
      );
    }
    for (const part of chunks(matches))
      await db(
        `supplier_product_matches?on_conflict=company_id,supplier_product_id,product_catalog_id`,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(part),
        },
      );
    await db(
      `product_catalog_imports?id=eq.${enc(importId)}&company_id=eq.${enc(input.companyId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString(),
        }),
      },
    );
    return {
      importId,
      supplierId,
      createdCount: payload.filter(
        (p) => !existingKeys.has(String(p.source_fingerprint)),
      ).length,
      updatedCount: payload.filter((p) =>
        existingKeys.has(String(p.source_fingerprint)),
      ).length,
      excludedCount: input.excludedCount,
      warningCount: input.warnings.length,
      matchCount: matches.filter((m) => m.match_status === "auto").length,
    };
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : "저장 실패"
    ).slice(0, 2000);
    await db<Array<{ id: string }>>(
      `product_catalog_imports?id=eq.${enc(importId)}&company_id=eq.${enc(input.companyId)}&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        }),
      },
    ).catch(() => null);
    throw error;
  }
}

export async function createCatalogFromSupplierProducts(
  companyId: string,
  ids: string[],
) {
  if (!ids.length) throw new Error("표준 품목으로 만들 상품을 선택해 주세요.");
  const products = await db<Array<Record<string, unknown>>>(
    `supplier_products?select=*&company_id=eq.${enc(companyId)}&id=in.(${ids.map(enc).join(",")})`,
  );
  const rows = products.map((p) => ({
    company_id: companyId,
    source: "supplier",
    source_key: `standard:${p.id}`,
    purchase_product_name: p.raw_name,
    purchase_spec: p.raw_spec || null,
    purchase_unit: p.raw_unit || "EA",
    purchase_price: p.latest_cost || 0,
    canonical_name: p.parsed_name || p.raw_name,
    brand_name: p.parsed_brand || null,
    origin_name: p.parsed_origin || null,
    spec_value: p.parsed_spec_value || null,
    spec_unit: p.parsed_spec_unit || null,
    pack_quantity: p.parsed_pack_quantity || null,
    usage_tags: Array.isArray((p.parser_metadata as Json)?.usage_tags)
      ? (p.parser_metadata as Json).usage_tags
      : [],
    barcodes: p.barcode ? [p.barcode] : [],
    match_status: "matched",
    is_active: true,
  }));
  let created: Array<{ id: string; source_key: string }> = [];
  for (const part of chunks(rows))
    created = created.concat(
      await db<Array<{ id: string; source_key: string }>>(
        `product_catalog?on_conflict=company_id,source,source_key`,
        {
          method: "POST",
          headers: {
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(part),
        },
      ),
    );
  const catalogBySource = new Map(created.map((x) => [x.source_key, x.id]));
  const matches = products
    .map((p) => ({
      company_id: companyId,
      supplier_product_id: p.id,
      product_catalog_id: catalogBySource.get(`standard:${p.id}`),
      match_status: "confirmed",
      candidate_rank: null,
      match_score: 100,
      name_matches: true,
      brand_matches: true,
      origin_matches: true,
      spec_matches: true,
      unit_matches: true,
      confirmed_at: new Date().toISOString(),
    }))
    .filter((x) => x.product_catalog_id);
  for (const part of chunks(matches))
    await db(
      `supplier_product_matches?on_conflict=company_id,supplier_product_id,product_catalog_id`,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(part),
      },
    );
  const evidence = products.flatMap((p) => {
    const productCatalogId = catalogBySource.get(`standard:${p.id}`);
    const tags = Array.isArray((p.parser_metadata as Json)?.usage_tags)
      ? ((p.parser_metadata as Json).usage_tags as unknown[]).map(String)
      : [];
    return productCatalogId
      ? tags.map((tag) => ({
          company_id: companyId,
          product_catalog_id: productCatalogId,
          usage_tag: tag,
          source: "rule",
          confidence: 0.7,
          evidence: "상품명·규격 키워드 규칙",
          is_confirmed: false,
        }))
      : [];
  });
  for (const part of chunks(evidence))
    await db(
      `product_usage_evidence?on_conflict=company_id,product_catalog_id,usage_tag,source`,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(part),
      },
    );
  return { createdCount: created.length };
}
