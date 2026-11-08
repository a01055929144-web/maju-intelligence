import type { OrderDeliveryCandidate } from "./order-route-consumer";

export type StoreOrderDeliveryRow = {
  id: string;
  company_id: string;
  customer_id: string;
  delivery_date: string;
  revision: number;
  status: "submitted" | "received" | "in_delivery" | "delivered" | "cancelled";
  normalized_customers: {
    customer_name: string;
    address: string | null;
    delivery_contact_phone: string | null;
    phone: string | null;
    delivery_drop_location: string | null;
    loading_position: string | null;
  };
};

export function toOrderDeliveryCandidates(rows: readonly StoreOrderDeliveryRow[]): OrderDeliveryCandidate[] {
  return rows.flatMap((row) => {
    if (row.status === "cancelled" || row.status === "delivered") return [];
    if (!row.id || !row.company_id || !row.customer_id || !/^\d{4}-\d{2}-\d{2}$/.test(row.delivery_date)) {
      throw new Error("주문 배송 식별 정보를 확인해 주세요.");
    }
    if (!Number.isInteger(row.revision) || row.revision < 1) throw new Error("주문 revision을 확인해 주세요.");
    const address = row.normalized_customers?.address?.trim();
    if (!row.normalized_customers?.customer_name.trim() || !address) {
      throw new Error("주문 배송지를 확인해 주세요.");
    }

    const customer = row.normalized_customers;
    return [{
      companyId: row.company_id,
      orderId: row.id,
      customerId: row.customer_id,
      deliveryDate: row.delivery_date,
      orderRevision: row.revision,
      destination: {
        customerName: customer.customer_name,
        address,
        ...(customer.delivery_contact_phone || customer.phone
          ? { recipientPhone: customer.delivery_contact_phone || customer.phone || undefined }
          : {}),
        ...(customer.delivery_drop_location || customer.loading_position
          ? { loadingPosition: customer.delivery_drop_location || customer.loading_position || undefined }
          : {})
      }
    }];
  });
}
