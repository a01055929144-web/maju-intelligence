import { convertedUnitCost } from "../domains/product/catalog-import";
import { customerErpCode } from "../domains/product/customer-erp-code";
import { cleanCategory, suggestCategory } from "../domains/pricing/product-category";
import { supabaseRequest as request } from "./store";
import { ciLayoutProducts, isCiLayoutFixturesEnabled } from "./ci-layout-fixtures";

export type ProductTaxType = "taxable" | "exempt";
export type ProductCatalogAdminItem = {
  id: string;
  productCode?: string;
  name: string;
  managementName?: string;
  brand?: string;
  barcodes?: string[];
  origin?: string;
  specValue?: number;
  specUnit?: string;
  spec?: string;
  unit: string;
  salesName?: string;
  salesSpec?: string;
  salesUnit?: string;
  purchaseUnit: string;
  purchaseToSalesRatio?: number;
  taxType?: ProductTaxType;
  category?: string;
  photoUrl?: string;
  isActive: boolean;
  matchStatus: "inactive" | "matched" | "requested" | "unmatched";
  salesPrice?: number;
  purchasePrice: number;
  linkedSupplierCount: number;
  minimumUnitCost?: number;
  hasUnconfirmedConversion: boolean;
  costOptions?: Array<{
    cost: number;
    isDefault: boolean;
    supplierName: string;
  }>;
  supplierNames?: string[];
  trackingEnabled?: boolean;
  onHand?: number;
  createdAt?: string;
  /** CC-20b: 오늘 진행 중인 행사·임박(여러 개면 종료가 가장 빠른 것). 읽기 전용. */
  promotion?: { badge: "행사" | "임박"; price: number; startsOn: string; endsOn: string };
};
export type SaveProductCatalogInput = Omit<
  ProductCatalogAdminItem,
  | "id"
  | "productCode"
  | "linkedSupplierCount"
  | "minimumUnitCost"
  | "hasUnconfirmedConversion"
  | "supplierNames"
  | "trackingEnabled"
  | "onHand"
  | "createdAt"
>;

type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const select =
  "id,product_code,canonical_name,purchase_product_name,brand_name,barcodes,origin_name,spec_value,spec_unit,sales_unit,purchase_unit,purchase_to_sales_ratio,tax_type,category,photo_url,is_active,default_sales_price,purchase_price,created_at";
const num = (v: unknown) => (v == null ? undefined : Number(v));
function toItem(r: Row): ProductCatalogAdminItem {
  const name = String(r.canonical_name || r.purchase_product_name || "");
  const spec =
    [r.spec_value, r.spec_unit].filter((v) => v != null && v !== "").join("") ||
    undefined;
  const isActive = Boolean(r.is_active);
  return {
    id: String(r.id),
    productCode: customerErpCode(r.product_code ? String(r.product_code) : null) || undefined,
    name,
    managementName:
      r.purchase_product_name && r.purchase_product_name !== name
        ? String(r.purchase_product_name)
        : undefined,
    brand: r.brand_name ? String(r.brand_name) : undefined,
    barcodes: Array.isArray(r.barcodes) ? r.barcodes.map(String) : [],
    origin: r.origin_name ? String(r.origin_name) : undefined,
    specValue: num(r.spec_value),
    specUnit: r.spec_unit ? String(r.spec_unit) : undefined,
    spec,
    unit: String(r.sales_unit || r.purchase_unit || "EA"),
    salesName: name,
    salesSpec: spec,
    salesUnit: r.sales_unit ? String(r.sales_unit) : undefined,
    purchaseUnit: String(r.purchase_unit || "EA"),
    purchaseToSalesRatio: num(r.purchase_to_sales_ratio),
    taxType: r.tax_type as ProductTaxType | undefined,
    category: r.category ? String(r.category) : undefined,
    photoUrl: r.photo_url ? String(r.photo_url) : undefined,
    isActive,
    matchStatus: isActive ? "matched" : "inactive",
    salesPrice: num(r.default_sales_price),
    purchasePrice: Number(r.purchase_price) || 0,
    linkedSupplierCount: 0,
    hasUnconfirmedConversion: false,
    createdAt: r.created_at ? String(r.created_at) : undefined,
  };
}
export async function listProductCatalogForAdmin(
  companyId: string,
  query = "",
) {
  if (isCiLayoutFixturesEnabled()) {
    const normalized = query.trim().toLocaleLowerCase("ko");
    return normalized
      ? ciLayoutProducts.filter((item) =>
          `${item.productCode || ""} ${item.name} ${item.managementName || ""}`
            .toLocaleLowerCase("ko")
            .includes(normalized),
        )
      : ciLayoutProducts;
  }
  const search = query.trim()
    ? `&or=(canonical_name.ilike.*${enc(query.trim())}*,purchase_product_name.ilike.*${enc(query.trim())}*,product_code.ilike.*${enc(query.trim())}*)`
    : "";
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // 한국 날짜
  const [rows, matches, supplierProducts, supplierRows, inventorySettings, balances, effective, promotions] = await Promise.all([
    request<Row[]>(
      `product_catalog?select=${select}&company_id=eq.${enc(companyId)}${search}&order=updated_at.desc&limit=1000`,
    ),
    request<Row[]>(
      `supplier_product_matches?select=product_catalog_id,supplier_product_id,purchase_to_sales_ratio,conversion_confirmed&company_id=eq.${enc(companyId)}&match_status=in.(auto,confirmed)&limit=5000`,
    ).catch(() => []),
    request<Row[]>(
      `supplier_products?select=id,supplier_id,latest_cost,cost_confirmed&company_id=eq.${enc(companyId)}&is_active=eq.true&limit=5000`,
    ).catch(() => []),
    request<Row[]>(
      `product_suppliers?select=id,name&company_id=eq.${enc(companyId)}&is_active=eq.true&limit=5000`,
    ).catch(() => []),
    request<Row[]>(
      `product_inventory_settings?select=product_catalog_id,tracking_enabled&company_id=eq.${enc(companyId)}&limit=5000`,
    ).catch(() => []),
    request<Row[]>(
      `inventory_balances?select=product_catalog_id,on_hand_quantity&company_id=eq.${enc(companyId)}&limit=5000`,
    ).catch(() => []),
    // 11/5: 마진 설정으로 계산된 판매가(단가표·주문 링크와 같은 값)
    request<Row[]>(
      `pricing_p0_effective?select=product_id,price&company_id=eq.${enc(companyId)}&limit=5000`,
    ).catch(() => []),
    // CC-20b: 오늘 진행 중인 행사(읽기만). 못 읽어도 상품 목록은 그대로.
    request<Row[]>(
      `pricing_promotions?select=product_id,badge,price,starts_on,ends_on&company_id=eq.${enc(companyId)}&starts_on=lte.${today}&ends_on=gte.${today}&order=ends_on.asc&limit=5000`,
    ).catch(() => []),
  ]);
  const promotionByProduct = new Map<string, NonNullable<ProductCatalogAdminItem["promotion"]>>();
  for (const x of promotions) {
    const id = String(x.product_id);
    if (!promotionByProduct.has(id)) promotionByProduct.set(id, { badge: x.badge === "임박" ? "임박" : "행사", price: Number(x.price), startsOn: String(x.starts_on), endsOn: String(x.ends_on) });
  }
  const effectivePrice = new Map(effective.map((x) => [String(x.product_id), x.price == null ? undefined : Number(x.price)]));
  const sp = new Map(supplierProducts.map((x) => [String(x.id), x])),
    supplierNames = new Map(supplierRows.map((x) => [String(x.id), String(x.name)])),
    settings = new Map(inventorySettings.map((x) => [String(x.product_catalog_id), x])),
    balanceByProduct = new Map(balances.map((x) => [String(x.product_catalog_id), Number(x.on_hand_quantity) || 0])),
    grouped = new Map<string, Row[]>();
  for (const m of matches) {
    const list = grouped.get(String(m.product_catalog_id)) || [];
    list.push(m);
    grouped.set(String(m.product_catalog_id), list);
  }
  return rows.map((r) => {
    const item = toItem(r),
      linked = grouped.get(item.id) || [],
      costs: Array<{ cost: number; isDefault: boolean; supplierName: string }> = [],
      linkedSupplierNames = new Set<string>();
    let pending = false;
    for (const m of linked) {
      const s = sp.get(String(m.supplier_product_id));
      if (s) linkedSupplierNames.add(
        supplierNames.get(String(s.supplier_id)) || "매입처 미확인",
      );
      if (!s?.cost_confirmed || s.latest_cost == null) continue;
      const c = convertedUnitCost(
        Number(s.latest_cost),
        num(m.purchase_to_sales_ratio),
        Boolean(m.conversion_confirmed),
      );
      if (c == null) pending = true;
      else costs.push({
        cost: c,
        isDefault: false,
        supplierName: supplierNames.get(String(s.supplier_id)) || "매입처 미확인",
      });
    }
    const minimum = costs.length ? Math.min(...costs.map((x) => x.cost)) : undefined;
    const names = Array.from(linkedSupplierNames);
    const setting = settings.get(item.id);
    return {
      ...item,
      // 11/5: 매입가 반영 화면은 상품 원장 매입가(판매 단위)를 바로 고칩니다. 환산 확정된 매입처 원가가 없으면 그 값을 씁니다.
      purchasePrice: minimum ?? item.purchasePrice,
      salesPrice: item.salesPrice ?? effectivePrice.get(item.id),
      linkedSupplierCount: linked.length,
      minimumUnitCost: minimum,
      hasUnconfirmedConversion: pending && minimum === undefined && !item.purchasePrice,
      costOptions: costs.map((x) => ({ ...x, isDefault: x.cost === minimum })),
      supplierNames: names,
      trackingEnabled: setting == null ? undefined : Boolean(setting.tracking_enabled),
      onHand: balanceByProduct.get(item.id),
      promotion: promotionByProduct.get(item.id),
    };
  });
}
function validate(i: SaveProductCatalogInput) {
  if (!i.name.trim()) throw new Error("품목명은 필수입니다.");
  // 수정 창 한 건 저장도 일괄 분류 저장과 같은 규칙(대·중·소 3단계, 단계마다 30자)으로 받는다.
  const category = cleanCategory(i.category ?? null);
  if (category && typeof category === "object") throw new Error(category.error);
  if (!i.purchaseUnit.trim() || !i.salesUnit?.trim())
    throw new Error("매입·판매 단위는 필수입니다.");
  if (
    i.purchaseToSalesRatio != null &&
    (!Number.isFinite(i.purchaseToSalesRatio) || i.purchaseToSalesRatio <= 0)
  )
    throw new Error("환산 비율은 0보다 커야 합니다.");
  if (
    i.salesPrice != null &&
    (!Number.isFinite(i.salesPrice) || i.salesPrice < 0)
  )
    throw new Error("판매가는 0 이상이어야 합니다.");
}
function write(i: SaveProductCatalogInput) {
  return {
    canonical_name: i.name.trim(),
    purchase_product_name: i.managementName?.trim() || i.name.trim(),
    brand_name: i.brand?.trim() || null,
    barcodes: i.barcodes || [],
    origin_name: i.origin?.trim() || null,
    spec_value: i.specValue ?? null,
    spec_unit: i.specUnit?.trim() || null,
    sales_unit: i.salesUnit?.trim() || null,
    purchase_unit: i.purchaseUnit.trim(),
    purchase_to_sales_ratio: i.purchaseToSalesRatio ?? null,
    tax_type: i.taxType || null,
    category: cleanCategory(i.category ?? null) as string | null, // validate()가 오류 값을 먼저 막는다.
    photo_url: i.photoUrl?.trim() || null,
    is_active: i.isActive,
    default_sales_price: i.salesPrice ?? null,
    purchase_price: i.purchasePrice || 0,
    updated_at: new Date().toISOString(),
  };
}
type Actor = { userId?: string; name: string };
async function recordPrice(
  companyId: string,
  id: string,
  previous: number | undefined,
  next: number,
  actor: Actor,
) {
  await request("product_sales_price_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      product_catalog_id: id,
      previous_price: previous ?? null,
      next_price: next,
      changed_by_user_id: actor.userId || null,
      changed_by_name: actor.name,
    }),
  });
}
export async function createProductCatalogForAdmin(
  companyId: string,
  input: SaveProductCatalogInput,
  actor: Actor,
) {
  validate(input);
  const code = await request<string>("rpc/next_product_code", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId }),
  });
  const rows = await request<Row[]>(`product_catalog?select=${select}`, {
    method: "POST",
    body: JSON.stringify({
      ...write(input),
      company_id: companyId,
      source: "manual",
      source_key: `manual:${crypto.randomUUID()}`,
      product_code: code,
      match_status: "matched",
      created_by_name: actor.name,
    }),
  });
  if (!rows[0]) throw new Error("품목을 생성하지 못했습니다.");
  if (input.salesPrice != null)
    await recordPrice(
      companyId,
      String(rows[0].id),
      undefined,
      input.salesPrice,
      actor,
    );
  return toItem(rows[0]);
}
export async function updateProductCatalogForAdmin(
  companyId: string,
  id: string,
  input: SaveProductCatalogInput,
  actor: Actor,
) {
  validate(input);
  const before = await request<Row[]>(
    `product_catalog?select=${select}&id=eq.${enc(id)}&company_id=eq.${enc(companyId)}`,
  );
  if (!before[0]) throw new Error("품목을 찾을 수 없습니다.");
  const rows = await request<Row[]>(
    `product_catalog?id=eq.${enc(id)}&company_id=eq.${enc(companyId)}&select=${select}`,
    { method: "PATCH", body: JSON.stringify(write(input)) },
  );
  if (!rows[0]) throw new Error("품목을 수정하지 못했습니다.");
  const previous = num(before[0].default_sales_price);
  if (input.salesPrice != null && previous !== input.salesPrice)
    await recordPrice(companyId, id, previous, input.salesPrice, actor);
  return toItem(rows[0]);
}

export type ProductCategoryUpdate = { id: string; category: string; expectedCategory: string };
export type ProductCategorySuggestion = { id: string; name: string; category: string; suggestion: string };

export async function listProductCategorySuggestions(
  companyId: string,
  page: number,
  pageSize = 200,
) {
  const offset = (Math.max(1, page) - 1) * pageSize;
  const source: Row[] = isCiLayoutFixturesEnabled()
    ? ciLayoutProducts.slice(offset, offset + pageSize).map((item): Row => ({ id: item.id, canonical_name: item.name, category: item.category, spec_value: item.specValue, spec_unit: item.specUnit }))
    : await request<Row[]>(`product_catalog?select=id,canonical_name,purchase_product_name,spec_value,spec_unit,category&company_id=eq.${enc(companyId)}&order=id&limit=${pageSize}&offset=${offset}`);
  const candidates = source.map((row) => {
    const name = String(row.canonical_name || row.purchase_product_name || "");
    const spec = [row.spec_value, row.spec_unit].filter((value) => value != null).join("");
    return { id: String(row.id), name, category: String(row.category || ""), suggestion: suggestCategory(name, spec) };
  }).filter((item) => item.suggestion && item.suggestion !== item.category);
  return { candidates, hasMore: source.length === pageSize };
}

const productId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cleanProductIds(ids: readonly string[]) {
  const unique = Array.from(new Set(ids));
  if (!unique.length || unique.length > 500 || !unique.every((id) => productId.test(id))) throw new Error("상품을 1~500개 골라 주세요.");
  return unique;
}

/** CC-24: 안 쓴 상품은 완전 삭제, 쓴 상품은 숨김(DB 함수 cc24_delete_products). apply=false면 숫자만 센다(확인창용). */
export async function deleteProductsForAdmin(companyId: string, ids: readonly string[], apply: boolean) {
  return request<{ requested: number; found: number; deletable: number; hideOnly: number; applied: boolean }>("rpc/cc24_delete_products", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_ids: cleanProductIds(ids), p_apply: apply }),
  });
}

/** 숨긴(is_active=false) 상품을 되살린다. 이 회사 상품만. */
export async function restoreProductsForAdmin(companyId: string, ids: readonly string[]) {
  const rows = await request<Array<{ id: string }>>(`product_catalog?company_id=eq.${enc(companyId)}&id=in.(${cleanProductIds(ids).join(",")})&is_active=eq.false&select=id`, {
    method: "PATCH", body: JSON.stringify({ is_active: true, updated_at: new Date().toISOString() }),
  });
  return rows.length;
}

/** 선택·확인된 추천만 회사 범위 안에서 저장합니다. 한 행 실패가 나머지를 막지 않습니다. */
export async function updateProductCategoriesForAdmin(
  companyId: string,
  updates: readonly ProductCategoryUpdate[],
) {
  if (!updates.length || updates.length > 50)
    throw new Error("한 번에 1~50개 품목을 저장할 수 있습니다.");
  const unique = Array.from(new Map(updates.map((item) => [item.id, item])).values());
  const results: Array<{ id: string; category?: string; ok: boolean; message?: string }> = [];
  for (let start = 0; start < unique.length; start += 5) {
    results.push(...await Promise.all(unique.slice(start, start + 5).map(async ({ id, category, expectedCategory }) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { id, ok: false as const, message: "품목 번호를 확인해 주세요." };
    const cleaned = cleanCategory(category);
    if (typeof cleaned !== "string") return { id, ok: false as const, message: cleaned && typeof cleaned === "object" ? cleaned.error : "추천 분류를 확인해 주세요." };
    try {
      const expected = cleanCategory(expectedCategory);
      if (expected && typeof expected === "object") return { id, ok: false as const, message: expected.error };
      const categoryCondition = expected === null ? "category=is.null" : `category=eq.${enc(expected)}`;
      const rows = await request<Row[]>(
        `product_catalog?id=eq.${enc(id)}&company_id=eq.${enc(companyId)}&${categoryCondition}&select=id,category`,
        { method: "PATCH", body: JSON.stringify({ category: cleaned, updated_at: new Date().toISOString() }) },
      );
      return rows[0]
        ? { id, category: cleaned, ok: true as const }
        : { id, ok: false as const, message: "다른 사용자가 분류를 변경했습니다. 새로고침 후 다시 검토해 주세요." };
    } catch (error) {
      return { id, ok: false as const, message: error instanceof Error ? error.message : "저장하지 못했습니다." };
    }
    })));
  }
  return results;
}
