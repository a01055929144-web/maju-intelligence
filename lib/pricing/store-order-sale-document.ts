import { supabaseRequest } from "@/lib/store";

export function receiveStoreOrderWithSaleDocument(companyId: string, orderId: string, revision: number,
  actor: { userId: string | null; name: string }) {
  return supabaseRequest<{ id: string; status: "received"; revision: number }>(
    "rpc/receive_store_order_with_sale_document", { method: "POST", body: JSON.stringify({
      p_company_id: companyId, p_order_id: orderId, p_expected_revision: revision,
      p_actor_user_id: actor.userId, p_actor_name: actor.name,
    }) },
  );
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
