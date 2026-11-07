import { supabaseRequest } from "../store";
import type { PurchaseDateRow } from "../../domains/pricing/purchase-cost-date";

export type PurchaseDateBatch = { id: string; status: "completed" | "restored" | "processing"; recalcRunId: string | null; rowCount: number; historyOnlyProductCount: number };
export function purchaseDateEnabled(companyId: string) {
  return (process.env.FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
export async function getPurchaseDateBatch(companyId: string, batchId?: string): Promise<PurchaseDateBatch | null> {
  const rows = await supabaseRequest<Array<{ id: string; status: PurchaseDateBatch["status"]; recalc_run_id: string | null; row_count: number; history_only_product_count: number }>>(
    `purchase_cost_date_batches_v2?select=id,status,recalc_run_id,row_count,history_only_product_count&company_id=eq.${encodeURIComponent(companyId)}${batchId ? `&id=eq.${batchId}` : ""}&order=created_at.desc,id.desc&limit=1`);
  return rows[0] ? { id: rows[0].id, status: rows[0].status, recalcRunId: rows[0].recalc_run_id, rowCount: rows[0].row_count, historyOnlyProductCount: rows[0].history_only_product_count } : null;
}
export async function undatedPurchasePrices(companyId: string) {
  const result: Array<{ productId: string; cost: number }> = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const rows = await supabaseRequest<Array<{ id: string; purchase_price: number }>>(
      `product_catalog?select=id,purchase_price&company_id=eq.${encodeURIComponent(companyId)}&purchase_price_date=is.null&purchase_price=gt.0&order=id&limit=500&offset=${offset}`);
    result.push(...rows.map(row => ({ productId: row.id, cost: Number(row.purchase_price) })));
    if (rows.length < 500) return result;
  }
  throw new Error("purchase_catalog_limit");
}
export async function savePurchaseDateBatch(companyId: string, batchId: string, date: string, fileName: string, actor: string, rows: PurchaseDateRow[]) {
  // Until SQL validates conversion under the same locks, mismatched units remain blocked.
  const ids = Array.from(new Set(rows.map(row => row.productId)));
  const units = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const products = await supabaseRequest<Array<{ id: string; sales_unit: string | null }>>(
      `product_catalog?select=id,sales_unit&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${ids.slice(offset, offset + 100).join(",")})`);
    products.forEach(product => units.set(product.id, (product.sales_unit || "").trim().toLowerCase()));
  }
  if (rows.some(row => row.unit.trim() && units.get(row.productId) && units.get(row.productId) !== row.unit.trim().toLowerCase())) throw new Error("purchase_date_unit_conversion_pending");
  const result = await supabaseRequest<{ batchId: string; recalcRunId: string | null; status: "completed" | "restored"; rowCount: number; historyOnlyProductCount: number }>("rpc/save_purchase_cost_date_batch_v2", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_batch: batchId, p_default_receipt_date: date,
      p_rows: rows, p_actor_name: actor, p_source_file_name: fileName })
  });
  return result;
}
export function restorePurchaseDateBatch(companyId: string, batchId: string, actor: string) {
  return supabaseRequest<{ batchId: string; status: "restored" }>("rpc/restore_purchase_cost_date_batch_v2", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_batch: batchId, p_actor_name: actor })
  });
}
export function purchaseDateError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("purchase_date_unit_conversion_pending")) return "원본 단위와 상품 판매 단위가 다르거나 비어 있습니다. 상품 단위를 확인한 뒤 다시 시도해 주세요.";
  if (message.includes("purchase_cost_date_batch_conflict")) return "같은 요청 번호의 내용이 달라졌습니다. 목록과 원본 파일을 다시 확인해 주세요.";
  if (message.includes("changed") || message.includes("latest") || message.includes("restored_separately")) return "기존 가격이나 이후 변경 내역이 달라 처리하지 못했습니다. 화면 전체를 새로고침하고 원본 파일을 다시 올려 현재 가격과 적용일을 확인해 주세요.";
  return "날짜별 매입가 처리가 완료되지 않았습니다. 같은 요청으로 다시 시도하거나 목록을 새로고침해 결과를 확인해 주세요.";
}
