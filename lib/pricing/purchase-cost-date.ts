import { supabaseRequest } from "../store";
import type { PurchaseDateRow } from "../../domains/pricing/purchase-cost-date";

export type PurchaseDateBatch = { id: string; status: "completed" | "restored" | "processing"; recalcRunId: string | null; rowCount: number };
export function purchaseDateEnabled(companyId: string) {
  return (process.env.FEATURE_PURCHASE_COST_DATE_V2_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}
export async function latestPurchaseDateBatch(companyId: string): Promise<PurchaseDateBatch | null> {
  const rows = await supabaseRequest<Array<{ id: string; status: PurchaseDateBatch["status"]; recalc_run_id: string | null; row_count: number }>>(
    `purchase_cost_date_batches_v2?select=id,status,recalc_run_id,row_count&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc,id.desc&limit=1`);
  return rows[0] ? { id: rows[0].id, status: rows[0].status, recalcRunId: rows[0].recalc_run_id, rowCount: rows[0].row_count } : null;
}
export async function savePurchaseDateBatch(companyId: string, batchId: string, date: string, fileName: string, actor: string, rows: PurchaseDateRow[]) {
  // Until SQL validates conversion under the same locks, mismatched units remain blocked.
  const ids = Array.from(new Set(rows.map(row => row.productId)));
  const units = new Map<string, string>();
  const unknownDates = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const products = await supabaseRequest<Array<{ id: string; sales_unit: string | null; purchase_price: number | null; purchase_price_date: string | null }>>(
      `product_catalog?select=id,sales_unit,purchase_price,purchase_price_date&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${ids.slice(offset, offset + 100).join(",")})`);
    products.forEach(product => { units.set(product.id, (product.sales_unit || "").trim().toLowerCase()); if (product.purchase_price != null && Number(product.purchase_price) !== 0 && !product.purchase_price_date) unknownDates.add(product.id); });
  }
  if (rows.some(row => row.unit.trim() && units.get(row.productId) && units.get(row.productId) !== row.unit.trim().toLowerCase())) throw new Error("purchase_date_unit_conversion_pending");
  const result = await supabaseRequest<{ batchId: string; recalcRunId: string | null; status: "completed" | "restored"; rowCount: number }>("rpc/save_purchase_cost_date_batch_v2", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_batch: batchId, p_default_receipt_date: date,
      p_rows: rows, p_actor_name: actor, p_source_file_name: fileName })
  });
  return { ...result, historyOnlyProductCount: Array.from(unknownDates).filter(id => rows.some(row => row.productId === id && row.priceSelected)).length };
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
  if (message.includes("changed") || message.includes("latest") || message.includes("restored_separately")) return "이후 가격 변경이 있어 처리하지 못했습니다. 목록을 새로고침하고 현재 가격을 확인해 주세요.";
  return "날짜별 매입가 처리가 완료되지 않았습니다. 같은 요청으로 다시 시도하거나 목록을 새로고침해 결과를 확인해 주세요.";
}
