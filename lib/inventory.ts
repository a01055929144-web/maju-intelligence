import { supabaseRequest } from "./store";

const enc = encodeURIComponent;
const rpc = <T>(name: string, body: Record<string, unknown>) =>
  supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
const INVENTORY_PAGE_SIZE = 100;
const ISSUE_PAGE_SIZE = 50;

type ProductRow = { id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string; sales_unit: string | null };
type BalanceRow = {
  product_catalog_id: string; on_hand_quantity: number; inventory_value: number;
  average_unit_cost: number | null; negative_cost_estimate: boolean; updated_at: string;
  product_catalog: ProductRow | ProductRow[] | null;
};
type InventoryFilter = "all" | "negative" | "in_stock" | "tracked";

function embeddedProduct(row: BalanceRow) {
  return Array.isArray(row.product_catalog) ? row.product_catalog[0] : row.product_catalog;
}

export async function listInventory(companyId: string, input: { cursor?: string; search?: string; filter?: InventoryFilter } = {}) {
  const filter = input.filter || "all";
  const search = input.search?.trim() || "";
  const trackedSettings = filter === "tracked" ? await supabaseRequest<Array<{ product_catalog_id: string; tracking_enabled: boolean; safety_stock_quantity: number }>>(
    `product_inventory_settings?select=product_catalog_id,tracking_enabled,safety_stock_quantity&company_id=eq.${enc(companyId)}&tracking_enabled=eq.true${input.cursor ? `&product_catalog_id=gt.${enc(input.cursor)}` : ""}&order=product_catalog_id.asc&limit=${INVENTORY_PAGE_SIZE + 1}`,
  ) : null;
  if (trackedSettings && trackedSettings.length === 0) return { items: [], nextCursor: null };
  const productSelect = "product_catalog!inventory_balances_product_fk!inner(id,product_code,canonical_name,purchase_product_name,sales_unit)";
  const query = [
    `select=product_catalog_id,on_hand_quantity,inventory_value,average_unit_cost,negative_cost_estimate,updated_at,${productSelect}`,
    `company_id=eq.${enc(companyId)}`, "order=product_catalog_id.asc", `limit=${INVENTORY_PAGE_SIZE + 1}`,
  ];
  if (input.cursor) query.push(`product_catalog_id=gt.${enc(input.cursor)}`);
  if (filter === "negative") query.push("on_hand_quantity=lt.0");
  if (filter === "in_stock") query.push("on_hand_quantity=neq.0");
  if (trackedSettings) query.push(`product_catalog_id=in.(${trackedSettings.slice(0, INVENTORY_PAGE_SIZE).map((setting) => enc(setting.product_catalog_id)).join(",")})`);
  if (search) {
    const term = search.replace(/[(),]/g, " ").trim();
    query.push(`product_catalog.or=(canonical_name.ilike.*${enc(term)}*,purchase_product_name.ilike.*${enc(term)}*,product_code.ilike.*${enc(term)}*)`);
  }
  let balances = await supabaseRequest<BalanceRow[]>(`inventory_balances?${query.join("&")}`);
  const hasMore = trackedSettings ? trackedSettings.length > INVENTORY_PAGE_SIZE : balances.length > INVENTORY_PAGE_SIZE;
  balances = balances.slice(0, INVENTORY_PAGE_SIZE);
  const productIds = balances.map((row) => row.product_catalog_id);
  const settings = trackedSettings?.slice(0, INVENTORY_PAGE_SIZE) || (productIds.length ? await supabaseRequest<Array<{ product_catalog_id: string; tracking_enabled: boolean; safety_stock_quantity: number }>>(
    `product_inventory_settings?select=product_catalog_id,tracking_enabled,safety_stock_quantity&company_id=eq.${enc(companyId)}&product_catalog_id=in.(${productIds.map(enc).join(",")})`,
  ) : []);
  const settingById = new Map(settings.map((setting) => [setting.product_catalog_id, setting]));
  const items = balances.map((balance) => {
    const product = embeddedProduct(balance); const setting = settingById.get(balance.product_catalog_id);
    return {
      id: balance.product_catalog_id, code: product?.product_code || null,
      name: product?.canonical_name || product?.purchase_product_name || "이름 없는 상품",
      baseUnit: product?.sales_unit || "EA", onHand: Number(balance.on_hand_quantity || 0),
      inventoryValue: Number(balance.inventory_value || 0), averageUnitCost: balance.average_unit_cost == null ? null : Number(balance.average_unit_cost),
      negativeCostEstimate: Boolean(balance.negative_cost_estimate), safetyStock: Number(setting?.safety_stock_quantity || 0),
      trackingEnabled: setting?.tracking_enabled ?? true, updatedAt: balance.updated_at || null,
    };
  });
  const nextCursor = hasMore ? (trackedSettings ? trackedSettings[INVENTORY_PAGE_SIZE - 1]?.product_catalog_id : balances.at(-1)?.product_catalog_id) || null : null;
  return { items, nextCursor };
}

export async function listInventoryMovements(companyId: string, productId: string) {
  return supabaseRequest<Array<{ id: string; movement_type: string; quantity_delta: number; value_delta: number; unit_cost: number | null; business_date: string; source_document_number_snapshot: string | null; reason: string | null; actor_name: string | null; created_at: string }>>(
    `inventory_movements?select=id,movement_type,quantity_delta,value_delta,unit_cost,business_date,source_document_number_snapshot,reason,actor_name,created_at&company_id=eq.${enc(companyId)}&product_catalog_id=eq.${enc(productId)}&order=created_at.desc&limit=200`,
  );
}

export async function searchStocktakeProducts(companyId: string, search = "") {
  const productQuery = [
    "select=id,product_code,canonical_name,purchase_product_name,sales_unit",
    `company_id=eq.${enc(companyId)}`,
    "order=canonical_name.asc",
    "limit=50",
  ];
  const term = search.trim().replace(/[(),]/g, " ");
  if (term) productQuery.push(`or=(canonical_name.ilike.*${enc(term)}*,purchase_product_name.ilike.*${enc(term)}*,product_code.ilike.*${enc(term)}*)`);
  const products = await supabaseRequest<ProductRow[]>(`product_catalog?${productQuery.join("&")}`);
  const productIds = products.map((product) => product.id);
  const balances = productIds.length ? await supabaseRequest<Array<{ product_catalog_id: string; on_hand_quantity: number }>>(
    `inventory_balances?select=product_catalog_id,on_hand_quantity&company_id=eq.${enc(companyId)}&product_catalog_id=in.(${productIds.map(enc).join(",")})`,
  ) : [];
  const onHandById = new Map(balances.map((balance) => [balance.product_catalog_id, Number(balance.on_hand_quantity || 0)]));
  return products.map((product) => ({
    id: product.id,
    code: product.product_code,
    name: product.canonical_name || product.purchase_product_name,
    baseUnit: product.sales_unit || "EA",
    onHand: onHandById.get(product.id) || 0,
  }));
}

export async function listUnitConversions(companyId: string, input: { search?: string; productId?: string } = {}) {
  const search = input.search?.trim() || "";
  const productQuery = ["select=id,product_code,canonical_name,purchase_product_name,sales_unit", `company_id=eq.${enc(companyId)}`, "order=canonical_name.asc", "limit=50"];
  if (search) {
    const term = search.replace(/[(),]/g, " ").trim();
    productQuery.push(`or=(canonical_name.ilike.*${enc(term)}*,purchase_product_name.ilike.*${enc(term)}*,product_code.ilike.*${enc(term)}*)`);
  }
  if (input.productId) productQuery.push(`id=eq.${enc(input.productId)}`);
  const products = await supabaseRequest<ProductRow[]>(`product_catalog?${productQuery.join("&")}`);
  const conversions = input.productId ? await supabaseRequest<Array<{ id: string; product_catalog_id: string; unit_name: string; base_quantity: number; is_base: boolean; is_confirmed: boolean; source: string }>>(
    `product_unit_conversions?select=*&company_id=eq.${enc(companyId)}&product_catalog_id=eq.${enc(input.productId)}&order=is_base.desc,unit_name.asc&limit=100`,
  ) : [];
  return {
    products: products.map((product) => ({ id: product.id, code: product.product_code, name: product.canonical_name || product.purchase_product_name, salesUnit: product.sales_unit })),
    conversions: conversions.map((conversion) => ({ ...conversion, base_quantity: Number(conversion.base_quantity) })),
  };
}

export async function saveUnitConversion(companyId: string, input: { id?: string; productId: string; unitName: string; baseQuantity: number; isBase: boolean; isConfirmed: boolean }, actorName: string) {
  if (!input.productId || !input.unitName.trim() || !Number.isFinite(input.baseQuantity) || input.baseQuantity <= 0) throw new Error("단위와 기본 수량을 확인해 주세요.");
  const body = { company_id: companyId, product_catalog_id: input.productId, unit_name: input.unitName.trim(), base_quantity: input.baseQuantity, is_base: input.isBase, is_confirmed: input.isConfirmed, source: "manual", created_by_name: actorName, updated_at: new Date().toISOString() };
  if (input.id) return supabaseRequest(`product_unit_conversions?company_id=eq.${enc(companyId)}&id=eq.${enc(input.id)}`, { method: "PATCH", body: JSON.stringify(body) });
  return supabaseRequest("product_unit_conversions", { method: "POST", body: JSON.stringify(body) });
}

export async function getDocumentInventoryStatus(companyId: string, documentId: string) {
  return rpc<Array<{ resolve_status: string; line_count: number }>>("inventory_document_status", { p_company_id: companyId, p_document_id: documentId });
}
export async function reapplyDocumentInventory(companyId: string, documentId: string, actorName: string) {
  await rpc("reapply_inventory_for_document", { p_company_id: companyId, p_document_id: documentId, p_actor_name: actorName });
  return getDocumentInventoryStatus(companyId, documentId);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length); let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) { const index = nextIndex++; result[index] = await mapper(items[index]); }
  }));
  return result;
}

export async function listInventoryIssues(companyId: string, page = 0) {
  const since = new Date(); since.setUTCDate(since.getUTCDate() - 30);
  const offset = Math.max(0, page) * ISSUE_PAGE_SIZE;
  const documents = await supabaseRequest<Array<{ id: string; document_number: string; document_date: string; partner_name_snapshot: string }>>(
    `business_documents?select=id,document_number,document_date,partner_name_snapshot&company_id=eq.${enc(companyId)}&status=eq.confirmed&document_date=gte.${enc(since.toISOString().slice(0, 10))}&order=document_date.desc,id.desc&limit=${ISSUE_PAGE_SIZE + 1}&offset=${offset}`,
  );
  const hasMore = documents.length > ISSUE_PAGE_SIZE; const pageDocuments = documents.slice(0, ISSUE_PAGE_SIZE);
  const statuses = await mapWithConcurrency(pageDocuments, 5, async (document) => ({ document, status: await getDocumentInventoryStatus(companyId, document.id) }));
  return {
    items: statuses.flatMap(({ document, status }) => status.filter((entry) => entry.resolve_status !== "ok").map((entry) => ({ ...document, resolveStatus: entry.resolve_status, lineCount: Number(entry.line_count) }))),
    hasMore, nextPage: hasMore ? page + 1 : null,
  };
}

export async function createAndPostStocktake(companyId: string, input: { countedOn: string; reason: string; lines: Array<{ productId: string; countedQuantity: number }> }, actorName: string) {
  if (!input.reason.trim() || !input.lines.length) throw new Error("실사 사유와 상품을 입력해 주세요.");
  const headers = await supabaseRequest<Array<{ id: string }>>("inventory_stocktakes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, counted_on: input.countedOn, reason: input.reason.trim(), created_by_name: actorName }) });
  const id = headers[0]?.id; if (!id) throw new Error("실사를 만들지 못했습니다.");
  try {
    await supabaseRequest("inventory_stocktake_lines", { method: "POST", body: JSON.stringify(input.lines.map((line) => ({ company_id: companyId, stocktake_id: id, product_catalog_id: line.productId, counted_quantity: line.countedQuantity }))) });
    return await rpc("post_inventory_stocktake", { p_company_id: companyId, p_stocktake_id: id, p_actor_name: actorName });
  } catch (error) {
    await supabaseRequest(`inventory_stocktakes?company_id=eq.${enc(companyId)}&id=eq.${enc(id)}&status=eq.draft`, { method: "DELETE" }).catch(() => null);
    throw error;
  }
}
