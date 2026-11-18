import { supabaseRequest } from "@/lib/store";

export type DispatchResult = {
  orderId: string;
  status: "in_delivery";
  revision: number;
  documentId: string;
  documentNumber: string;
};

export function dispatchStoreOrders(companyId: string, orderIds: string[], idempotencyKey: string,
  actor: { userId?: string; name: string }) {
  return supabaseRequest<DispatchResult[]>("rpc/dispatch_store_orders", {
    method: "POST",
    body: JSON.stringify({
      p_company_id: companyId,
      p_order_ids: orderIds,
      p_idempotency_key: idempotencyKey,
      p_actor_user_id: actor.userId || null,
      p_actor_name: actor.name,
    }),
  });
}
