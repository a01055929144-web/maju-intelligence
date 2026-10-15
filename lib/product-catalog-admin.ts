import { convertedUnitCost } from "../domains/product/catalog-import";
import { supabaseRequest as request } from "./store";

export type ProductTaxType = "taxable" | "exempt";
export type ProductCatalogAdminItem = {
  id: string;
  productCode?: string;
  name: string;
  brand?: string;
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
};
export type SaveProductCatalogInput = Omit<
  ProductCatalogAdminItem,
  | "id"
  | "productCode"
  | "linkedSupplierCount"
  | "minimumUnitCost"
  | "hasUnconfirmedConversion"
>;
type Row = Record<string, unknown>;
const enc = encodeURIComponent;
const select =
  "id,product_code,canonical_name,purchase_product_name,brand_name,origin_name,spec_value,spec_unit,sales_unit,purchase_unit,purchase_to_sales_ratio,tax_type,category,photo_url,is_active,default_sales_price,purchase_price";
const num = (v: unknown) => (v == null ? undefined : Number(v));
function toItem(r: Row): ProductCatalogAdminItem {
  const name = String(r.canonical_name || r.purchase_product_name || "");
  const spec =
    [r.spec_value, r.spec_unit].filter((v) => v != null && v !== "").join("") ||
    undefined;
  const isActive = Boolean(r.is_active);
  return {
    id: String(r.id),
    productCode: r.product_code ? String(r.product_code) : undefined,
    name,
    brand: r.brand_name ? String(r.brand_name) : undefined,
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
  };
}
export async function listProductCatalogForAdmin(
  companyId: string,
  query = "",
) {
  const search = query.trim()
    ? `&or=(canonical_name.ilike.*${enc(query.trim())}*,purchase_product_name.ilike.*${enc(query.trim())}*,product_code.ilike.*${enc(query.trim())}*)`
    : "";
  const [rows, matches, suppliers] = await Promise.all([
    request<Row[]>(
      `product_catalog?select=${select}&company_id=eq.${enc(companyId)}${search}&order=updated_at.desc&limit=1000`,
    ),
    request<Row[]>(
      `supplier_product_matches?select=product_catalog_id,supplier_product_id,purchase_to_sales_ratio,conversion_confirmed&company_id=eq.${enc(companyId)}&match_status=in.(auto,confirmed)&limit=5000`,
    ).catch(() => []),
    request<Row[]>(
      `supplier_products?select=id,latest_cost,cost_confirmed&company_id=eq.${enc(companyId)}&is_active=eq.true&limit=5000`,
    ).catch(() => []),
  ]);
  const sp = new Map(suppliers.map((x) => [String(x.id), x])),
    grouped = new Map<string, Row[]>();
  for (const m of matches) {
    const list = grouped.get(String(m.product_catalog_id)) || [];
    list.push(m);
    grouped.set(String(m.product_catalog_id), list);
  }
  return rows.map((r) => {
    const item = toItem(r),
      linked = grouped.get(item.id) || [],
      costs: number[] = [];
    let pending = false;
    for (const m of linked) {
      const s = sp.get(String(m.supplier_product_id));
      if (!s?.cost_confirmed || s.latest_cost == null) continue;
      const c = convertedUnitCost(
        Number(s.latest_cost),
        num(m.purchase_to_sales_ratio),
        Boolean(m.conversion_confirmed),
      );
      if (c == null) pending = true;
      else costs.push(c);
    }
    const minimum = costs.length ? Math.min(...costs) : undefined;
    return {
      ...item,
      purchasePrice: minimum ?? item.purchasePrice,
      linkedSupplierCount: linked.length,
      minimumUnitCost: minimum,
      hasUnconfirmedConversion: pending,
      costOptions:
        minimum == null
          ? []
          : [{ cost: minimum, isDefault: true, supplierName: "환산 원가" }],
    };
  });
}
function validate(i: SaveProductCatalogInput) {
  if (!i.name.trim()) throw new Error("품목명은 필수입니다.");
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
    purchase_product_name: i.name.trim(),
    brand_name: i.brand?.trim() || null,
    origin_name: i.origin?.trim() || null,
    spec_value: i.specValue ?? null,
    spec_unit: i.specUnit?.trim() || null,
    sales_unit: i.salesUnit?.trim() || null,
    purchase_unit: i.purchaseUnit.trim(),
    purchase_to_sales_ratio: i.purchaseToSalesRatio ?? null,
    tax_type: i.taxType || null,
    category: i.category?.trim() || null,
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
