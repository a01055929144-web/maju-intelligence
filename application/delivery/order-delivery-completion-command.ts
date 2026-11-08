import type { StageDRouteStop } from "./stage-d-delivery-flow";

export type OrderDeliveryCompletionCommand = {
  companyId: string;
  customerId: string;
  deliveryDate: string;
  completionEventId: string;
  idempotencyKey: string;
  completedAt: string;
  orders: Array<{ orderId: string; orderRevision: number }>;
  proof: { noteId?: string; attachmentIds: string[] };
};

export function buildOrderDeliveryCompletionCommand(input: {
  companyId: string;
  stop: StageDRouteStop;
  selectedOrderIds: readonly string[];
  completionEventId: string;
  idempotencyKey: string;
  completedAt: string;
  noteId?: string;
  attachmentIds?: readonly string[];
}): OrderDeliveryCompletionCommand {
  if (!input.companyId.trim() || !input.completionEventId.trim() || !input.idempotencyKey.trim()) {
    throw new Error("배송 완료 식별 정보를 확인해 주세요.");
  }
  if (input.stop.conflict) throw new Error("배송지 충돌 주문을 완료할 수 없습니다.");
  if (!input.stop.orderIds.length) throw new Error("배정된 주문이 없는 정류장은 주문 완료 처리할 수 없습니다.");
  if (Number.isNaN(Date.parse(input.completedAt))) throw new Error("배송 완료 시각을 확인해 주세요.");

  const selectedOrderIds = input.selectedOrderIds.map((orderId) => orderId.trim()).sort();
  if (!selectedOrderIds.length || selectedOrderIds.some((orderId) => !orderId) || new Set(selectedOrderIds).size !== selectedOrderIds.length) {
    throw new Error("완료할 주문 ID가 중복되었거나 비어 있습니다.");
  }

  const assignedOrderIds = new Set(input.stop.orderIds);
  const orders = selectedOrderIds.map((orderId) => {
    if (!assignedOrderIds.has(orderId)) throw new Error("배정되지 않았거나 취소된 주문은 완료할 수 없습니다.");
    const orderRevision = input.stop.orderRevisions[orderId];
    if (!Number.isInteger(orderRevision) || orderRevision < 1) throw new Error("주문 revision을 확인해 주세요.");
    return { orderId, orderRevision };
  });

  return {
    companyId: input.companyId,
    customerId: input.stop.customerId,
    deliveryDate: input.stop.deliveryDate,
    completionEventId: input.completionEventId,
    idempotencyKey: input.idempotencyKey,
    completedAt: input.completedAt,
    orders,
    proof: {
      ...(input.noteId?.trim() ? { noteId: input.noteId.trim() } : {}),
      attachmentIds: Array.from(new Set((input.attachmentIds || []).map((id) => id.trim()).filter(Boolean))).sort()
    }
  };
}
