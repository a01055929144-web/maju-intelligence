import type { OrderDeliveryCandidate } from "./order-route-consumer";

export type StoreOrderDeliveryRow = {
  id: string;
  company_id: string;
  customer_id: string;
  delivery_date: string;
  revision: number;
  status: "submitted" | "received" | "in_delivery" | "delivered" | "cancelled";
  delivery_customer_name_snapshot?: string | null;
  delivery_address_snapshot?: string | null;
  delivery_address_detail_snapshot?: string | null;
  delivery_recipient_phone_snapshot?: string | null;
  delivery_loading_position_snapshot?: string | null;
};

export function toOrderDeliveryCandidates(rows: readonly StoreOrderDeliveryRow[]): OrderDeliveryCandidate[] {
  return rows.flatMap((row) => {
    if (row.status === "cancelled" || row.status === "delivered") return [];
    if (!row.id || !row.company_id || !row.customer_id || !/^\d{4}-\d{2}-\d{2}$/.test(row.delivery_date)) {
      throw new Error("주문 배송 식별 정보를 확인해 주세요.");
    }
    if (!Number.isInteger(row.revision) || row.revision < 1) throw new Error("주문 revision을 확인해 주세요.");
    const customerName = row.delivery_customer_name_snapshot?.trim();
    const address = row.delivery_address_snapshot?.trim();
    if (!customerName || !address) return [];

    return [{
      companyId: row.company_id,
      orderId: row.id,
      customerId: row.customer_id,
      deliveryDate: row.delivery_date,
      orderRevision: row.revision,
      destination: {
        customerName,
        address,
        ...(row.delivery_address_detail_snapshot
          ? { addressDetail: row.delivery_address_detail_snapshot }
          : {}),
        ...(row.delivery_recipient_phone_snapshot
          ? { recipientPhone: row.delivery_recipient_phone_snapshot }
          : {}),
        ...(row.delivery_loading_position_snapshot
          ? { loadingPosition: row.delivery_loading_position_snapshot }
          : {})
      }
    }];
  });
}
