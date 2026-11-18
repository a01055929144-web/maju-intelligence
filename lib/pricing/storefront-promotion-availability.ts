import { isId, MAX_DOCUMENT_LINES } from "../../domains/pricing/document";
import { promotionAvailabilityFromRow, type PromotionAvailability } from "../../domains/order/promotion-availability";
import { supabaseRequest } from "../store";

export function storePromotionAvailabilityEnabled(companyId: string) {
  return Boolean(companyId) && process.env.STORE_PROMOTION_AVAILABILITY_ENABLED === "true" &&
    (process.env.STORE_PROMOTION_AVAILABILITY_COMPANY_IDS || "").split(",").some(id => id.trim() === companyId);
}

/** Caller supplies the company and promotion IDs from the verified storefront, never the request body. */
export async function readStorePromotionAvailability(companyId: string, promotionIds: readonly string[]) {
  if (!storePromotionAvailabilityEnabled(companyId)) return undefined;
  const ids = [...new Set(promotionIds.filter(isId))];
  if (!ids.length) return undefined;
  const result: Record<string, PromotionAvailability> = Object.fromEntries(ids.map(id => [id, { state: "unavailable" } as const]));
  if (ids.length > MAX_DOCUMENT_LINES) return result;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const rows = await supabaseRequest<Array<Record<string, unknown>>>("rpc/promotion_remaining_v1", {
        method: "POST", body: JSON.stringify({ p_company: companyId, p_promotion_ids: batch }),
      });
      if (!Array.isArray(rows)) throw new Error("invalid_promotion_availability");
      const seen = new Set<string>();
      for (const row of rows) {
        if (!row || typeof row.promotion_id !== "string" || !batch.includes(row.promotion_id) || seen.has(row.promotion_id))
          throw new Error("invalid_promotion_availability_scope");
        seen.add(row.promotion_id);
      }
      for (const row of rows) result[row.promotion_id as string] = promotionAvailabilityFromRow(row);
    } catch {
      // Missing/unapproved SQL or a failed read is unknown, never zero or unlimited.
      // Do not log raw RPC errors or business quantities.
    }
  }
  return result;
}
