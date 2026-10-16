import { supabaseRequest } from "./store";

const enc = encodeURIComponent;
const rpc = <T>(name: string, body: Record<string, unknown>) => supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });

type ProductRow = { id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string; sales_unit: string | null };

export async function listInventory(companyId: string) {
  const [products, balances, settings] = await Promise.all([
    supabaseRequest<ProductRow[]>(`product_catalog?select=id,product_code,canonical_name,purchase_product_name,sales_unit&company_id=eq.${enc(companyId)}&order=canonical_name&limit=5000`),
    supabaseRequest<Array<{ product_catalog_id: string; on_hand_quantity: number; inventory_value: number; average_unit_cost: number | null; negative_cost_estimate: boolean; updated_at: string }>>(`inventory_balances?select=*&company_id=eq.${enc(companyId)}&limit=5000`),
    supabaseRequest<Array<{ product_catalog_id: string; tracking_enabled: boolean; safety_stock_quantity: number }>>(`product_inventory_settings?select=product_catalog_id,tracking_enabled,safety_stock_quantity&company_id=eq.${enc(companyId)}&limit=5000`),
  ]);
  const balanceById = new Map(balances.map((x) => [x.product_catalog_id, x]));
  const settingById = new Map(settings.map((x) => [x.product_catalog_id, x]));
  return products.map((product) => {
    const balance = balanceById.get(product.id); const setting = settingById.get(product.id);
    return { id: product.id, code: product.product_code, name: product.canonical_name || product.purchase_product_name, baseUnit: product.sales_unit || "EA", onHand: Number(balance?.on_hand_quantity || 0), inventoryValue: Number(balance?.inventory_value || 0), averageUnitCost: balance?.average_unit_cost == null ? null : Number(balance.average_unit_cost), negativeCostEstimate: Boolean(balance?.negative_cost_estimate), safetyStock: Number(setting?.safety_stock_quantity || 0), trackingEnabled: setting?.tracking_enabled ?? true, updatedAt: balance?.updated_at || null };
  });
}

export async function listInventoryMovements(companyId: string, productId: string) {
  return supabaseRequest<Array<{ id: string; movement_type: string; quantity_delta: number; value_delta: number; unit_cost: number | null; business_date: string; source_document_number_snapshot: string | null; reason: string | null; actor_name: string | null; created_at: string }>>(`inventory_movements?select=id,movement_type,quantity_delta,value_delta,unit_cost,business_date,source_document_number_snapshot,reason,actor_name,created_at&company_id=eq.${enc(companyId)}&product_catalog_id=eq.${enc(productId)}&order=created_at.desc&limit=200`);
}

export async function listUnitConversions(companyId: string) {
  const [products, conversions] = await Promise.all([
    supabaseRequest<ProductRow[]>(`product_catalog?select=id,product_code,canonical_name,purchase_product_name,sales_unit&company_id=eq.${enc(companyId)}&order=canonical_name&limit=5000`),
    supabaseRequest<Array<{ id: string; product_catalog_id: string; unit_name: string; base_quantity: number; is_base: boolean; is_confirmed: boolean; source: string }>>(`product_unit_conversions?select=*&company_id=eq.${enc(companyId)}&order=product_catalog_id,is_base.desc,unit_name&limit=10000`),
  ]);
  return { products: products.map((x) => ({ id: x.id, code: x.product_code, name: x.canonical_name || x.purchase_product_name, salesUnit: x.sales_unit })), conversions: conversions.map((x) => ({ ...x, base_quantity: Number(x.base_quantity) })) };
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

export async function listInventoryIssues(companyId: string) {
  const documents = await supabaseRequest<Array<{ id: string; document_number: string; document_date: string; partner_name_snapshot: string }>>(`business_documents?select=id,document_number,document_date,partner_name_snapshot&company_id=eq.${enc(companyId)}&status=eq.confirmed&order=document_date.desc&limit=300`);
  const statuses = await Promise.all(documents.map(async (document) => ({ document, status: await getDocumentInventoryStatus(companyId, document.id) })));
  return statuses.flatMap(({ document, status }) => status.filter((x) => x.resolve_status !== "ok").map((x) => ({ ...document, resolveStatus: x.resolve_status, lineCount: Number(x.line_count) })));
}

export async function createAndPostStocktake(companyId: string, input: { countedOn: string; reason: string; lines: Array<{ productId: string; countedQuantity: number }> }, actorName: string) {
  if (!input.reason.trim() || !input.lines.length) throw new Error("실사 사유와 상품을 입력해 주세요.");
  const headers = await supabaseRequest<Array<{ id: string }>>("inventory_stocktakes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, counted_on: input.countedOn, reason: input.reason.trim(), created_by_name: actorName }) });
  const id = headers[0]?.id; if (!id) throw new Error("실사를 만들지 못했습니다.");
  await supabaseRequest("inventory_stocktake_lines", { method: "POST", body: JSON.stringify(input.lines.map((line) => ({ company_id: companyId, stocktake_id: id, product_catalog_id: line.productId, counted_quantity: line.countedQuantity }))) });
  return rpc("post_inventory_stocktake", { p_company_id: companyId, p_stocktake_id: id, p_actor_name: actorName });
}
