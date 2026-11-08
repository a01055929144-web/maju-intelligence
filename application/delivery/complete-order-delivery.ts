import type { OrderDeliveryCompletionCommand } from "./order-delivery-completion-command";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE = new Set(["submitted", "received", "in_delivery"]);

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Actor = { actorKey: string; companyId: string; driverKeys: string[]; staffMemberId?: string; vehicleKeys: string[] };
type OrderRow = { id: string; customer_id: string; delivery_date: string; revision: number; status: string; delivery_customer_name_snapshot: string | null; delivery_address_snapshot: string | null };

export class DeliveryCompletionError extends Error {}

export async function completeOrderDelivery(input: OrderDeliveryCompletionCommand, actor: Actor, request: Request) {
  validateCommand(input, actor.companyId);
  const orderIds = input.orders.map((order) => order.orderId).sort();
  const attachmentIds = [...input.proof.attachmentIds].sort();
  const encodedCompany = encodeURIComponent(actor.companyId);
  const encodedCustomer = encodeURIComponent(input.customerId);
  const encodedIds = orderIds.join(",");

  const [confirmations, customers, orders, notes, attachments] = await Promise.all([
    request<Array<{ customer_ids: unknown; driver_name: string }>>(
      `route_plan_confirmations?select=driver_name,customer_ids&company_id=eq.${encodedCompany}&route_date=eq.${encodeURIComponent(input.deliveryDate)}`
    ),
    request<Array<{ assigned_staff_member_id: string | null; delivery_manager: string | null; delivery_vehicle: string | null; id: string }>>(
      `normalized_customers?select=id,assigned_staff_member_id,delivery_manager,delivery_vehicle&company_id=eq.${encodedCompany}&id=eq.${encodedCustomer}&limit=1`
    ),
    request<OrderRow[]>(
      `store_orders?select=id,customer_id,delivery_date,revision,status,delivery_customer_name_snapshot,delivery_address_snapshot&company_id=eq.${encodedCompany}&id=in.(${encodedIds})&limit=100`
    ),
    input.proof.noteId ? request<Array<{ id: string; note_type: string }>>(
      `customer_notes?select=id,note_type&company_id=eq.${encodedCompany}&customer_id=eq.${encodedCustomer}&id=eq.${encodeURIComponent(input.proof.noteId)}&limit=1`
    ) : Promise.resolve([]),
    request<Array<{ attachment_type: string; id: string }>>(
      `customer_attachments?select=id,attachment_type&company_id=eq.${encodedCompany}&customer_id=eq.${encodedCustomer}&id=in.(${attachmentIds.join(",")})&limit=100`
    )
  ]);

  const customer = customers[0];
  if (!customer || !isAssignedCustomer(customer, actor)) throw new DeliveryCompletionError("배송 기사에게 배정된 거래처가 아닙니다.");
  if (!customer.delivery_vehicle?.trim() || !actor.vehicleKeys.includes(customer.delivery_vehicle.trim())) {
    throw new DeliveryCompletionError("배송 차량 배정을 확인해 주세요.");
  }
  if (!confirmations.some((row) => actor.driverKeys.includes(row.driver_name.trim()) && Array.isArray(row.customer_ids) && row.customer_ids.includes(input.customerId))) {
    throw new DeliveryCompletionError("확정된 오늘 코스의 정류장이 아닙니다.");
  }
  if (!input.proof.noteId || notes[0]?.note_type !== "delivery") throw new DeliveryCompletionError("배송 완료 메모를 확인해 주세요.");
  if (attachments.length !== attachmentIds.length || attachments.some((item) => item.attachment_type !== "delivery_proof")) {
    throw new DeliveryCompletionError("배송 완료 사진을 확인해 주세요.");
  }

  if (orders.length !== input.orders.length) throw new DeliveryCompletionError("완료할 주문을 찾을 수 없습니다.");
  const revisionById = new Map(input.orders.map((order) => [order.orderId, order.orderRevision]));
  for (const order of orders) {
    const expectedRevision = revisionById.get(order.id)!;
    const isPendingCompletion = ACTIVE.has(order.status) && order.revision === expectedRevision;
    const isCompletionRetry = order.status === "delivered" && order.revision === expectedRevision + 1;
    if (order.customer_id !== input.customerId || order.delivery_date !== input.deliveryDate || (!isPendingCompletion && !isCompletionRetry)) {
      throw new DeliveryCompletionError("현재 정류장에서 완료할 수 없는 주문입니다.");
    }
    if (!order.delivery_customer_name_snapshot || !order.delivery_address_snapshot) throw new DeliveryCompletionError("배송지 snapshot을 확인해 주세요.");
  }

  const expectedRevisions = Object.fromEntries(input.orders.map((order) => [order.orderId, order.orderRevision]));
  const result = await request<{
    attachmentIds: string[]; companyId: string; completedAt: string; completionEventId: string; customerId: string; deliveryDate: string; noteId: string;
    orderIds: string[]; orderRevisions: Record<string, number>;
  }>("rpc/complete_store_order_delivery_09", {
    method: "POST",
    body: JSON.stringify({
      p_actor_key: actor.actorKey,
      p_company: actor.companyId,
      p_completed_at: input.completedAt,
      p_completion_event_id: input.completionEventId,
      p_customer_id: input.customerId,
      p_delivery_date: input.deliveryDate,
      p_expected_revisions: expectedRevisions,
      p_note_id: input.proof.noteId,
      p_attachment_ids: attachmentIds,
      p_order_ids: orderIds
    })
  });
  return validateResult(result, input, actor);
}

function validateResult(value: unknown, input: OrderDeliveryCompletionCommand, actor: Actor) {
  const result = value as {
    attachmentIds?: string[]; companyId?: string; completedAt?: string; completionEventId?: string; customerId?: string; deliveryDate?: string; noteId?: string;
    orderIds?: string[]; orderRevisions?: Record<string, number>;
  };
  if (result.companyId !== actor.companyId || result.customerId !== input.customerId || result.completionEventId !== input.completionEventId || result.deliveryDate !== input.deliveryDate || result.completedAt !== input.completedAt || result.noteId !== input.proof.noteId) {
    throw new DeliveryCompletionError("배송 완료 결과 범위가 요청과 다릅니다.");
  }
  const requestedAttachments = [...input.proof.attachmentIds].sort();
  const returnedAttachments = Array.isArray(result.attachmentIds) ? [...result.attachmentIds].sort() : [];
  if (returnedAttachments.join("|") !== requestedAttachments.join("|")) throw new DeliveryCompletionError("배송 완료 결과의 증빙이 요청과 다릅니다.");
  const requestedIds = input.orders.map((order) => order.orderId).sort();
  const returnedIds = Array.isArray(result.orderIds) ? [...result.orderIds].sort() : [];
  if (returnedIds.join("|") !== requestedIds.join("|")) throw new DeliveryCompletionError("배송 완료 결과의 주문이 요청과 다릅니다.");
  for (const order of input.orders) {
    if (!Number.isInteger(result.orderRevisions?.[order.orderId]) || result.orderRevisions?.[order.orderId] !== order.orderRevision + 1) {
      throw new DeliveryCompletionError("배송 완료 결과의 revision이 요청과 다릅니다.");
    }
  }
  return {
    completionEventId: result.completionEventId,
    completedAt: result.completedAt,
    orders: returnedIds.map((orderId) => ({ orderId, orderRevision: result.orderRevisions![orderId] }))
  };
}

function validateCommand(input: OrderDeliveryCompletionCommand, companyId: string) {
  if (input.companyId !== companyId || !UUID.test(input.customerId) || !UUID.test(input.completionEventId) || input.idempotencyKey !== input.completionEventId) {
    throw new DeliveryCompletionError("배송 완료 요청 범위를 확인해 주세요.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate) || Number.isNaN(Date.parse(input.completedAt))) throw new DeliveryCompletionError("배송 완료 날짜를 확인해 주세요.");
  if (!input.orders.length || input.orders.length > 100 || new Set(input.orders.map((order) => order.orderId)).size !== input.orders.length) {
    throw new DeliveryCompletionError("완료할 주문을 확인해 주세요.");
  }
  if (input.orders.some((order) => !UUID.test(order.orderId) || !Number.isInteger(order.orderRevision) || order.orderRevision < 1)) {
    throw new DeliveryCompletionError("주문 ID와 revision을 확인해 주세요.");
  }
  if (!input.proof.noteId || !UUID.test(input.proof.noteId) || !input.proof.attachmentIds.length || new Set(input.proof.attachmentIds).size !== input.proof.attachmentIds.length || input.proof.attachmentIds.some((id) => !UUID.test(id))) {
    throw new DeliveryCompletionError("배송 완료 증빙을 확인해 주세요.");
  }
}

function isAssignedCustomer(customer: { assigned_staff_member_id: string | null; delivery_manager: string | null }, actor: Actor) {
  return Boolean(
    (actor.staffMemberId && customer.assigned_staff_member_id === actor.staffMemberId)
    || (customer.delivery_manager?.trim() && actor.driverKeys.includes(customer.delivery_manager.trim()))
  );
}
