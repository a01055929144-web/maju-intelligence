export const catalogFields = [
  "productName",
  "spec",
  "unit",
  "cost",
  "salesPrice",
  "productCode",
  "barcode",
  "buyerName",
  "buyerCode",
  "date",
  "quantity",
  "supplyAmount",
  "vat",
] as const;
export type CatalogField = (typeof catalogFields)[number];
export type CatalogMapping = Partial<Record<CatalogField, string>>;
export type RawCatalogRow = Record<string, unknown>;
export type ParsedProduct = {
  barcode?: string;
  brand?: string;
  cost: number;
  costConfirmed: boolean;
  date?: string;
  name: string;
  origin?: string;
  packQuantity?: number;
  productCode?: string;
  quantity?: number;
  rawName: string;
  rawSpec?: string;
  rawUnit?: string;
  sourceFingerprint: string;
  specUnit?: string;
  specValue?: number;
  unit: string;
  usageTags: string[];
  parsedTaxType?: "taxable" | "exempt";
  salesMin?: number;
  salesMedian?: number;
  observations: Array<{
    buyerCode?: string;
    buyerName: string;
    date: string;
    quantity?: number;
    rowKey: string;
    unitPrice: number;
  }>;
};

const aliases: Record<CatalogField, string[]> = {
  productName: ["상품명", "품명", "제품명"],
  spec: ["규격", "상품규격"],
  unit: ["단위", "판매단위"],
  cost: ["매입가", "원가", "매입단가"],
  salesPrice: ["매출가", "판매가", "단가"],
  productCode: ["기본코드", "상품코드", "품목코드"],
  barcode: ["바코드", "barcode"],
  buyerName: ["거래처", "구매처", "거래처명"],
  buyerCode: ["거래처코드", "구매처코드"],
  date: ["일자", "거래일", "출고일"],
  quantity: ["수량", "출고수량"],
  supplyAmount: ["공급가액", "공급액", "과세표준"],
  vat: ["부가세", "세액", "VAT"],
};

export function inferTaxType(vat?: number, supplyAmount?: number) {
  if (vat == null || vat < 0) return undefined;
  if (vat === 0) return "exempt" as const;
  if (supplyAmount && supplyAmount > 0) {
    const rate = vat / supplyAmount;
    if (rate >= 0.08 && rate <= 0.12) return "taxable" as const;
  }
  return undefined;
}

export function convertedUnitCost(
  cost: number,
  ratio?: number,
  confirmed = false,
) {
  if (!confirmed || !ratio || ratio <= 0) return undefined;
  return cost / ratio;
}
export const normalizeHeader = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()[\]]/g, "");
const text = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
const num = (v: unknown) => {
  const raw = String(v ?? "").trim();
  const accountingNegative = /^\(.*\)$/.test(raw);
  const n = Number(raw.replace(/[(),원%\s]/g, ""));
  return Number.isFinite(n) ? (accountingNegative ? -n : n) : undefined;
};
export function suggestCatalogMapping(headers: string[]): CatalogMapping {
  return catalogFields.reduce<CatalogMapping>((m, f) => {
    const h = headers.find((x) =>
      aliases[f].some((a) => normalizeHeader(a) === normalizeHeader(x)),
    );
    if (h) m[f] = h;
    return m;
  }, {});
}
const origins = [
  "국내산",
  "국산",
  "수입산",
  "미국산",
  "중국산",
  "호주산",
  "뉴질랜드산",
  "네덜란드산",
  "칠레산",
  "베트남산",
  "태국산",
  "러시아산",
  "캐나다산",
  "스페인산",
  "브라질산",
  "인도산",
  "페루산",
  "필리핀산",
  "일본산",
];
const brandAliases: Record<string, string[]> = {
  CJ: ["cj", "씨제이"],
  담두: ["담두"],
  면사랑: ["면사랑"],
  청정원: ["청정원"],
  오뚜기: ["오뚜기"],
  동원: ["동원"],
  풀무원: ["풀무원"],
  하림: ["하림"],
  백설: ["백설"],
  샘표: ["샘표"],
};
const usageRules: Record<string, string[]> = {
  구이: ["구이용", "구이"],
  "찌개·국": ["찌개", "국거리"],
  조림: ["조림용", "조림"],
  튀김: ["튀김"],
  볶음: ["볶음"],
  육수: ["육수"],
  김밥: ["김밥"],
  손질: ["손질"],
  대패: ["대패"],
  다짐: ["다짐"],
};
export function parseProductText(rawName: string, rawSpec = "") {
  const original = `${rawName} ${rawSpec}`;
  const cleaned = text(rawName)
    .replace(/^[*★先]+/, "")
    .replace(/[■]+$/g, "")
    .trim();
  const lower = original.toLowerCase();
  const origin = origins.find((x) => lower.includes(x));
  const brand = Object.entries(brandAliases).find(([, xs]) =>
    xs.some((x) => lower.includes(x)),
  )?.[0];
  const sm = original.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|ℓ)/i);
  let specValue = sm ? Number(sm[1].replace(",", ".")) : undefined;
  let specUnit = sm?.[2]?.toLowerCase().replace("ℓ", "l");
  if (specValue && specUnit === "kg") {
    specValue *= 1000;
    specUnit = "g";
  }
  if (specValue && specUnit === "l") {
    specValue *= 1000;
    specUnit = "ml";
  }
  const pm = original.match(/(?:b\s*\/\s*|\*\s*)(\d+)\s*(?:개|봉|팩|ea)?/i);
  return {
    brand,
    cleaned,
    origin: origin === "국산" ? "국내산" : origin,
    packQuantity: pm ? Number(pm[1]) : undefined,
    specUnit,
    specValue,
    usageTags: Object.entries(usageRules)
      .filter(([, xs]) => xs.some((x) => lower.includes(x)))
      .map(([tag]) => tag),
  };
}
const val = (r: RawCatalogRow, m: CatalogMapping, f: CatalogField) =>
  m[f] ? r[m[f]!] : undefined;
const median = (a: number[]) => {
  if (!a.length) return undefined;
  const s = [...a].sort((x, y) => x - y),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export function buildCatalogPreview(
  rows: RawCatalogRow[],
  mapping: CatalogMapping,
  supplier: string,
) {
  if (!mapping.productName) throw new Error("상품명 열을 선택해주세요.");
  if (!mapping.cost) throw new Error("원가 열을 직접 선택해주세요.");
  const excluded: Record<string, number> = {},
    groups = new Map<string, RawCatalogRow[]>();
  const skip = (r: string) => (excluded[r] = (excluded[r] || 0) + 1);
  rows.forEach((r) => {
    const n = text(val(r, mapping, "productName"));
    if (!n) return skip("상품명 없음");
    if (/^\[?합\s*계\]?$/i.test(n)) return skip("합계 행");
    const q = num(val(r, mapping, "quantity"));
    if (q != null && q < 0) return skip("반품 행");
    const code = text(val(r, mapping, "productCode")),
      bar = text(val(r, mapping, "barcode"));
    const fp = `${normalizeHeader(supplier)}:${code ? `code:${normalizeHeader(code)}` : bar ? `barcode:${normalizeHeader(bar)}` : `name:${normalizeHeader(n)}|${normalizeHeader(val(r, mapping, "spec"))}|${normalizeHeader(val(r, mapping, "unit"))}`}`;
    (groups.get(fp) || groups.set(fp, []).get(fp)!).push(r);
  });
  const products: ParsedProduct[] = [];
  groups.forEach((rs, fp) => {
    const sorted = [...rs].sort((a, b) =>
      text(val(b, mapping, "date")).localeCompare(
        text(val(a, mapping, "date")),
      ),
    );
    const latest =
        sorted.find((r) => num(val(r, mapping, "cost")) != null) || sorted[0],
      cost = num(val(latest, mapping, "cost"));
    if (cost == null || cost < 0) return skip("원가 없음");
    const rawName = text(val(latest, mapping, "productName")),
      rawSpec = text(val(latest, mapping, "spec")),
      p = parseProductText(rawName, rawSpec),
      sales = rs
        .map((r) => num(val(r, mapping, "salesPrice")))
        .filter((x): x is number => x != null && x >= 0);
    products.push({
      barcode: text(val(latest, mapping, "barcode")) || undefined,
      brand: p.brand,
      cost,
      costConfirmed: true,
      date: text(val(latest, mapping, "date")) || undefined,
      name: p.cleaned,
      origin: p.origin,
      packQuantity: p.packQuantity,
      productCode: text(val(latest, mapping, "productCode")) || undefined,
      quantity: num(val(latest, mapping, "quantity")),
      rawName,
      rawSpec: rawSpec || undefined,
      rawUnit: text(val(latest, mapping, "unit")) || undefined,
      sourceFingerprint: fp,
      specUnit: p.specUnit,
      specValue: p.specValue,
      unit: text(val(latest, mapping, "unit")) || "미정",
      usageTags: p.usageTags,
      parsedTaxType: inferTaxType(
        num(val(latest, mapping, "vat")),
        num(val(latest, mapping, "supplyAmount")),
      ),
      salesMin: sales.length ? Math.min(...sales) : undefined,
      salesMedian: median(sales),
      observations: rs.map((r, i) => ({
        buyerCode: text(val(r, mapping, "buyerCode")) || undefined,
        buyerName: text(val(r, mapping, "buyerName")) || "미상",
        date:
          text(val(r, mapping, "date")) ||
          new Date().toISOString().slice(0, 10),
        quantity: num(val(r, mapping, "quantity")),
        rowKey: `${fp}:${i}:${text(val(r, mapping, "buyerCode"))}`,
        unitPrice: num(val(r, mapping, "salesPrice")) || 0,
      })),
    });
  });
  const comparable = products.filter((p) => p.salesMedian != null),
    warnings: string[] = [];
  const high = comparable.filter((p) => p.cost > (p.salesMedian || 0)).length,
    same = comparable.filter((p) => p.cost === p.salesMedian).length;
  if (high) warnings.push(`원가가 참고 판매가보다 높은 품목 ${high}건`);
  if (comparable.length >= 5 && same / comparable.length >= 0.6)
    warnings.push("선택한 원가 열이 판매가와 같습니다.");
  return {
    excluded,
    excludedCount: Object.values(excluded).reduce((a, b) => a + b, 0),
    products,
    warnings,
  };
}

export function scoreProductMatch(
  source: ParsedProduct,
  target: {
    barcodes?: string[];
    brand?: string;
    name: string;
    origin?: string;
    specUnit?: string;
    specValue?: number;
    unit?: string;
  },
) {
  if (source.barcode && target.barcodes?.includes(source.barcode))
    return { auto: true, score: 100 };
  const eq = (a?: string, b?: string) =>
    Boolean(a && b && normalizeHeader(a) === normalizeHeader(b));
  const flags = {
    name: eq(source.name, target.name),
    brand: eq(source.brand, target.brand),
    origin: eq(source.origin, target.origin),
    spec: Boolean(
      source.specValue &&
      target.specValue &&
      source.specUnit === target.specUnit &&
      source.specValue === target.specValue,
    ),
    unit: eq(source.unit, target.unit),
  };
  const score =
    (flags.name ? 35 : 0) +
    (flags.spec ? 20 : 0) +
    (flags.brand ? 15 : 0) +
    (flags.origin ? 15 : 0) +
    (flags.unit ? 15 : 0);
  return { auto: Object.values(flags).every(Boolean), flags, score };
}

export function rankProductCandidates<
  T extends {
    id: string;
    barcodes?: string[];
    brand?: string;
    name: string;
    origin?: string;
    specUnit?: string;
    specValue?: number;
    unit?: string;
  },
>(source: ParsedProduct, targets: T[], rejectedCatalogIds = new Set<string>()) {
  return targets
    .filter((target) => !rejectedCatalogIds.has(target.id))
    .map((target) => ({ target, result: scoreProductMatch(source, target) }))
    .filter((candidate) => candidate.result.score > 0)
    .sort((left, right) => right.result.score - left.result.score)
    .slice(0, 3);
}

export function planSupplierMatchRefresh(
  supplierProductIds: string[],
  existingMatches: Array<{
    matchStatus: "auto" | "candidate" | "confirmed" | "rejected";
    productCatalogId: string;
    supplierProductId: string;
  }>,
) {
  const protectedSupplierIds = new Set(
    existingMatches
      .filter(
        (match) =>
          match.matchStatus === "auto" || match.matchStatus === "confirmed",
      )
      .map((match) => match.supplierProductId),
  );
  const rejectedCatalogIds = new Map<string, Set<string>>();
  for (const match of existingMatches) {
    if (match.matchStatus !== "rejected") continue;
    const ids =
      rejectedCatalogIds.get(match.supplierProductId) || new Set<string>();
    ids.add(match.productCatalogId);
    rejectedCatalogIds.set(match.supplierProductId, ids);
  }
  return {
    protectedSupplierIds,
    rejectedCatalogIds,
    unresolvedSupplierIds: supplierProductIds.filter(
      (id) => !protectedSupplierIds.has(id),
    ),
  };
}

export function buildSupplierProductWrite(
  companyId: string,
  supplierId: string,
  product: ParsedProduct,
) {
  return {
    barcode: product.barcode || null,
    company_id: companyId,
    cost_confirmed: product.costConfirmed,
    is_active: true,
    last_seen_date: product.date || new Date().toISOString().slice(0, 10),
    latest_cost: product.cost,
    parsed_brand: product.brand || null,
    parsed_name: product.name,
    parsed_origin: product.origin || null,
    parsed_pack_quantity: product.packQuantity || null,
    parsed_spec_unit: product.specUnit || null,
    parsed_spec_value: product.specValue || null,
    parsed_tax_type: product.parsedTaxType || null,
    parser_metadata: { usage_tags: product.usageTags },
    raw_name: product.rawName,
    raw_spec: product.rawSpec || null,
    raw_unit: product.rawUnit || null,
    source_fingerprint: product.sourceFingerprint,
    supplier_code: product.productCode || null,
    supplier_id: supplierId,
    updated_at: new Date().toISOString(),
  };
}
