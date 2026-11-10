export const STORE_ORDER_STATUSES = ["submitted", "received", "in_delivery", "delivered", "cancelled"] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];

const labels: Record<StoreOrderStatus, string> = {
  submitted: "접수됨",
  received: "확인됨",
  in_delivery: "배송 중",
  delivered: "배송 완료",
  cancelled: "취소됨",
};

export function isStoreOrderStatus(value: string): value is StoreOrderStatus {
  return (STORE_ORDER_STATUSES as readonly string[]).includes(value);
}

export function storeOrderStatusLabel(status: string): string {
  return isStoreOrderStatus(status) ? labels[status] : "확인 필요";
}

/** 고객사 확인은 새 주문만 가능하다. 확인 뒤에는 점주 수정 함수가 status='submitted'가 아니라서 수정을 막는다. */
export function canConfirmStoreOrder(status: string): boolean {
  return status === "submitted";
}
