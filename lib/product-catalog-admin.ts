export type ProductCatalogAdminItem = {
  costOptions?: Array<{ cost: number; isDefault: boolean; supplierName: string }>;
  id: string;
  matchStatus: "inactive" | "matched" | "requested" | "unmatched";
  name: string;
  purchasePrice: number;
  salesName?: string;
  salesPrice?: number;
  salesSpec?: string;
  salesUnit?: string;
  spec?: string;
  unit: string;
};

export type UpdateProductCatalogInput = {
  matchStatus: ProductCatalogAdminItem["matchStatus"];
  name: string;
  purchasePrice: number;
  salesName?: string;
  salesPrice?: number;
  salesSpec?: string;
  salesUnit?: string;
  spec?: string;
  unit: string;
};

type ProductCatalogRow = {
  default_sales_price: number | null;
  id: string;
  match_status: ProductCatalogAdminItem["matchStatus"];
  purchase_price: number;
  purchase_product_name: string;
  purchase_spec: string | null;
  purchase_unit: string;
  sales_product_name: string | null;
  sales_spec: string | null;
  sales_unit: string | null;
};

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { key, url: url.replace(/\/$/, "") };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

function toItem(row: ProductCatalogRow): ProductCatalogAdminItem {
  return {
    id: row.id,
    matchStatus: row.match_status,
    name: row.purchase_product_name,
    purchasePrice: Number(row.purchase_price) || 0,
    salesName: row.sales_product_name || undefined,
    salesPrice: row.default_sales_price == null ? undefined : Number(row.default_sales_price),
    salesSpec: row.sales_spec || undefined,
    salesUnit: row.sales_unit || undefined,
    spec: row.purchase_spec || undefined,
    unit: row.purchase_unit || "EA"
  };
}

const select = "id,purchase_product_name,purchase_spec,purchase_unit,purchase_price,sales_product_name,sales_spec,sales_unit,default_sales_price,match_status";

export async function listProductCatalogForAdmin(companyId: string, query = "") {
  const token = query.trim();
  const search = token
    ? `&or=(purchase_product_name.ilike.*${encodeURIComponent(token)}*,sales_product_name.ilike.*${encodeURIComponent(token)}*)`
    : "";
  const [rows, matches, supplierProducts, suppliers, defaults] = await Promise.all([
    request<ProductCatalogRow[]>(`product_catalog?select=${select}&company_id=eq.${encodeURIComponent(companyId)}${search}&order=updated_at.desc&limit=300`),
    request<Array<{ product_catalog_id: string; supplier_product_id: string }>>(`supplier_product_matches?select=product_catalog_id,supplier_product_id&company_id=eq.${encodeURIComponent(companyId)}&match_status=in.(auto,confirmed)&limit=3000`).catch(() => []),
    request<Array<{ id: string; latest_cost: number | null; cost_confirmed: boolean; supplier_id: string }>>(`supplier_products?select=id,supplier_id,latest_cost,cost_confirmed&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true&limit=3000`).catch(() => []),
    request<Array<{ id: string; name: string }>>(`product_suppliers?select=id,name&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true`).catch(() => []),
    request<Array<{ product_catalog_id: string; supplier_product_id: string }>>(`product_supplier_defaults?select=product_catalog_id,supplier_product_id&company_id=eq.${encodeURIComponent(companyId)}`).catch(() => [])
  ]);
  const products = new Map(supplierProducts.map((item) => [item.id, item]));
  const supplierNames = new Map(suppliers.map((item) => [item.id, item.name]));
  const defaultKeys = new Set(defaults.map((item) => `${item.product_catalog_id}:${item.supplier_product_id}`));
  const options = new Map<string, ProductCatalogAdminItem["costOptions"]>();
  for (const match of matches) {
    const product = products.get(match.supplier_product_id);
    if (!product?.cost_confirmed || product.latest_cost == null) continue;
    const list = options.get(match.product_catalog_id) || [];
    list.push({ cost: Number(product.latest_cost), isDefault: defaultKeys.has(`${match.product_catalog_id}:${match.supplier_product_id}`), supplierName: supplierNames.get(product.supplier_id) || "유통사" });
    options.set(match.product_catalog_id, list);
  }
  return rows.map((row) => ({ ...toItem(row), costOptions: (options.get(row.id) || []).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.cost - b.cost) }));
}

export async function updateProductCatalogForAdmin(companyId: string, id: string, input: UpdateProductCatalogInput) {
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!name || !unit) throw new Error("매입 상품명과 단위는 필수입니다.");
  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice < 0) throw new Error("매입가는 0 이상이어야 합니다.");
  if (input.salesPrice != null && (!Number.isFinite(input.salesPrice) || input.salesPrice < 0)) throw new Error("판매가는 0 이상이어야 합니다.");
  if (input.matchStatus === "matched" && !input.salesName?.trim()) throw new Error("매칭 완료 상태에는 판매 상품명이 필요합니다.");

  const rows = await request<ProductCatalogRow[]>(
    `product_catalog?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(companyId)}&select=${select}`,
    {
      body: JSON.stringify({
        default_sales_price: input.salesPrice ?? null,
        match_status: input.matchStatus,
        purchase_price: input.purchasePrice,
        purchase_product_name: name,
        purchase_spec: input.spec?.trim() || null,
        purchase_unit: unit,
        sales_product_name: input.salesName?.trim() || null,
        sales_spec: input.salesSpec?.trim() || null,
        sales_unit: input.salesUnit?.trim() || null,
        updated_at: new Date().toISOString()
      }),
      method: "PATCH"
    }
  );
  if (!rows[0]) throw new Error("상품을 찾을 수 없거나 수정 권한이 없습니다.");
  return toItem(rows[0]);
}
