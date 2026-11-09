import { isId } from "../../domains/pricing/document";
import { parseStoreOrderDeliverySnapshot } from "../../domains/order/store-order-delivery-snapshot";
import type { OrderDeliveryCandidate } from "../../application/delivery/order-route-consumer";
import { supabaseRequest } from "@/lib/store";
import { storeOrderDeliverySnapshotEnabled } from "./store-order-delivery-feature";

type Scope = { companyId: string; customerId: string; linkId: string; customerName: string; deliveryAddress: string | null };
type Payload = Record<string, unknown> & { p_idempotency_key: string; p_delivery_date: string; p_order_id: string | null };
type SnapshotRow = {
  delivery_customer_name_snapshot: string | null; delivery_address_snapshot: string | null;
  delivery_address_detail_snapshot: string | null; delivery_recipient_phone_snapshot: string | null; delivery_loading_position_snapshot: string | null;
};
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

/** The DTO is the acknowledged revision/date receipt, not a fresh route assignment. */
export async function placeStoreOrderWithDelivery(input: { scope: Scope; payload: Payload; snapshot?: unknown }, request: Request = supabaseRequest) {
  const { scope, payload } = input;
  if (!storeOrderDeliverySnapshotEnabled(scope.companyId)) throw new Error("delivery_producer_disabled");
  let snapshotInput = input.snapshot;
  if (snapshotInput === undefined) {
    let orderId = payload.p_order_id;
    if (!orderId) {
      const cached = await request<Array<{ order_id: string }>>(
        `store_order_delivery_requests_09?company_id=eq.${encodeURIComponent(scope.companyId)}&link_id=eq.${encodeURIComponent(scope.linkId)}&idempotency_key=eq.${encodeURIComponent(payload.p_idempotency_key)}&select=order_id&limit=1`);
      orderId = cached[0]?.order_id || null;
    }
    if (orderId) {
      if (!isId(orderId)) throw new Error("delivery_snapshot_required");
      const rows = await request<SnapshotRow[]>(
        `store_orders?company_id=eq.${encodeURIComponent(scope.companyId)}&customer_id=eq.${encodeURIComponent(scope.customerId)}&id=eq.${orderId}&select=delivery_customer_name_snapshot,delivery_address_snapshot,delivery_address_detail_snapshot,delivery_recipient_phone_snapshot,delivery_loading_position_snapshot&limit=1`);
      const row = rows[0];
      if (!row) throw new Error("delivery_snapshot_required");
      snapshotInput = {
        deliveryCustomerNameSnapshot: row.delivery_customer_name_snapshot, deliveryAddressSnapshot: row.delivery_address_snapshot,
        deliveryAddressDetailSnapshot: row.delivery_address_detail_snapshot, deliveryRecipientPhoneSnapshot: row.delivery_recipient_phone_snapshot,
        deliveryLoadingPositionSnapshot: row.delivery_loading_position_snapshot,
      };
    } else {
      snapshotInput = { deliveryCustomerNameSnapshot: scope.customerName, deliveryAddressSnapshot: scope.deliveryAddress };
    }
  }
  const snapshot = parseStoreOrderDeliverySnapshot(snapshotInput);
  const result = await request<Record<string, unknown>>("rpc/place_store_order_with_delivery_snapshot_09",
    { method: "POST", body: JSON.stringify({ ...payload, p_snapshot: snapshot }) });
  if (!isId(result.id) || !Number.isSafeInteger(result.revision) || Number(result.revision) < 1) throw new Error("delivery_result_unconfirmed");
  const delivery: OrderDeliveryCandidate = {
    companyId: scope.companyId, customerId: scope.customerId, orderId: String(result.id),
    deliveryDate: payload.p_delivery_date, orderRevision: Number(result.revision),
    destination: {
      customerName: snapshot.deliveryCustomerNameSnapshot!, address: snapshot.deliveryAddressSnapshot!,
      ...(snapshot.deliveryAddressDetailSnapshot ? { addressDetail: snapshot.deliveryAddressDetailSnapshot } : {}),
      ...(snapshot.deliveryRecipientPhoneSnapshot ? { recipientPhone: snapshot.deliveryRecipientPhoneSnapshot } : {}),
      ...(snapshot.deliveryLoadingPositionSnapshot ? { loadingPosition: snapshot.deliveryLoadingPositionSnapshot } : {}),
    },
  };
  return { result, delivery };
}
