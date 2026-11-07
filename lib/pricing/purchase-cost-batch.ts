import { supabaseRequest } from "../store";
import type { PurchaseCostChange } from "../../application/pricing/update-purchase-cost";

export type PurchaseCostBatchChange = PurchaseCostChange & { expectedSupplierCost?: number | null };
export type PurchaseCostBatch = { id: string; restoredAt: string | null };
export const MAX_PURCHASE_COST_BATCH = 999_999_999_999.99;

export function validPurchaseCostBatchValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    && value <= MAX_PURCHASE_COST_BATCH && Number(value.toFixed(2)) === value;
}

export function purchaseCostBatchError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (["purchase_cost_changed", "supplier_cost_changed", "product_changed_since_purchase_batch", "supplier_changed_since_purchase_batch"].some((code) => message.includes(code)))
    return "저장 후 가격이 변경됐습니다. 목록을 새로고침하고 다시 확인해 주세요.";
  if (message.includes("purchase_unit_conversion_missing") || message.includes("supplier_unit_cost_not_representable"))
    return "매입처 상품의 단위 환산을 확인해 주세요.";
  if (message.includes("only_latest_purchase_cost_batch") || message.includes("price_changed_since_purchase_batch") || message.includes("price_run_restored_separately"))
    return "이후 가격 변경이 있어 직전 배치를 복구할 수 없습니다. 매입 이력에서 확인해 주세요.";
  if (message.includes("purchase_cost_batch_conflict")) return "같은 저장 요청의 내용이 달라졌습니다. 목록을 새로고침해 주세요.";
  return "매입가 일괄 처리에 실패했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.";
}

/** Company opt-in only. An absent value leaves the legacy save path intact. */
export function purchaseCostBatchEnabled(companyId: string) {
  return (process.env.FEATURE_PURCHASE_COST_BATCH_COMPANY_IDS || "")
    .split(",").some((id) => id.trim() === companyId);
}

export async function latestPurchaseCostBatch(companyId: string): Promise<PurchaseCostBatch | null> {
  const rows = await supabaseRequest<Array<{ id: string; restored_at: string | null }>>(
    `purchase_cost_batches?select=id,restored_at&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc,id.desc&limit=1`
  );
  return rows[0] ? { id: rows[0].id, restoredAt: rows[0].restored_at } : null;
}

export function savePurchaseCostBatch(companyId: string, batchId: string, actorName: string, changes: PurchaseCostBatchChange[]) {
  return supabaseRequest<{ batchId: string; priceRunId: string | null; status: string }>("rpc/save_purchase_cost_batch_v1", {
    method: "POST",
    body: JSON.stringify({ p_company: companyId, p_batch: batchId, p_changes: changes, p_actor_name: actorName })
  });
}

export function restorePurchaseCostBatch(companyId: string, batchId: string, actorName: string) {
  return supabaseRequest<{ batchId: string; status: string }>("rpc/restore_purchase_cost_batch_v1", {
    method: "POST",
    body: JSON.stringify({ p_company: companyId, p_batch: batchId, p_actor_name: actorName })
  });
}
