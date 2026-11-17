import { isId } from "@/domains/pricing/document";
import { erpOrderDocumentsEnabled } from "@/lib/erp-order-documents-feature";
import { supabaseRequest } from "@/lib/store";

type OrderDocumentStatus = "confirmed" | "failed";

export async function syncStoreOrderSaleDocument(
  companyId: string,
  result: Record<string, unknown>,
  actorUserId: string | null,
  actorName = "매장 온라인 주문",
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
    p_actor_name: actorName,
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

type ConfirmedSaleDocument = { source_id: string; source_key: string; customer_id: string; document_number: string };

export async function readConfirmedOrderSaleDocuments(companyId: string, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, ConfirmedSaleDocument>();
  const rows = await supabaseRequest<ConfirmedSaleDocument[]>(
    `business_documents?company_id=eq.${encodeURIComponent(companyId)}&document_type=eq.sale&source_type=eq.order&status=eq.confirmed` +
    `&source_id=in.(${orderIds.map(encodeURIComponent).join(",")})&select=source_id,source_key,customer_id,document_number`,
  );
  return new Map(rows.filter(row => row.source_key === `order:${row.source_id}`).map(row => [row.source_id, row]));
}
