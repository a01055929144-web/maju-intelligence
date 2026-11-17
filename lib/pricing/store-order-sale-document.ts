import { isId } from "@/domains/pricing/document";
import { erpOrderDocumentsEnabled } from "@/lib/erp-order-documents-feature";
import { supabaseRequest } from "@/lib/store";

type OrderDocumentStatus = "confirmed" | "failed";

export async function syncStoreOrderSaleDocument(
  companyId: string,
  result: Record<string, unknown>,
  actorUserId: string | null,
): Promise<OrderDocumentStatus | undefined> {
  if (!erpOrderDocumentsEnabled(companyId)) return undefined;
  const { id, revision } = result;
  if (!isId(id) || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
    return "failed";
  }

  const actor = {
    p_company_id: companyId,
    p_order_id: id,
    p_actor_user_id: actorUserId,
    p_actor_name: "매장 온라인 주문",
  };
  try {
    // Confirm is idempotent and can recover an order whose first document attempt failed.
    await supabaseRequest("rpc/confirm_order_sale_document", { method: "POST", body: JSON.stringify(actor) });
    if (revision > 1) {
      await supabaseRequest("rpc/revise_order_sale_document", {
        method: "POST",
        body: JSON.stringify({ ...actor, p_expected_order_revision: revision, p_reason: "매장 주문 수정" }),
      });
    }
    return "confirmed";
  } catch {
    // Keep the saved order acknowledgement intact and do not expose accounting errors to the link holder.
    return "failed";
  }
}
