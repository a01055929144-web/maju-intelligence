import type { OrderRouteConsumerResult, RouteStopOrderRead } from "./order-route-consumer";

export type ExistingDeliveryStop = {
  customerId: string;
  driverId: string;
  vehicleId: string;
};

export type DeliveryCompletionEvent = {
  eventId: string;
  companyId: string;
  customerId: string;
  deliveryDate: string;
  orderIds: string[];
  completedAt: string;
};

export type StageDRouteStop = ExistingDeliveryStop & {
  deliveryDate: string;
  orderIds: string[];
  orderRevisions: Record<string, number>;
  conflict?: "destination_mismatch";
  completionEventId?: string;
  completedAt?: string;
};

export type StageDDeliveryFlow = {
  routeStops: StageDRouteStop[];
  unassigned: RouteStopOrderRead[];
  blocked: RouteStopOrderRead[];
  history: Array<{
    completionEventId: string;
    customerId: string;
    deliveryDate: string;
    orderIds: string[];
    completedAt: string;
    driverId: string;
    vehicleId: string;
  }>;
};

export function buildStageDDeliveryFlow(input: {
  companyId: string;
  deliveryDate: string;
  existingStops: readonly ExistingDeliveryStop[];
  orderRead: OrderRouteConsumerResult;
  completionEvents: readonly DeliveryCompletionEvent[];
}): StageDDeliveryFlow {
  if (!input.companyId.trim()) throw new Error("회사 ID가 필요합니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) throw new Error("배송일을 확인해 주세요.");

  const stopByCustomerId = new Map<string, StageDRouteStop>();
  const routeStops = input.existingStops.map((stop) => {
    if (!stop.customerId.trim() || !stop.driverId.trim() || !stop.vehicleId.trim()) {
      throw new Error("기존 정류장의 거래처·기사·차량 ID가 필요합니다.");
    }
    if (stopByCustomerId.has(stop.customerId)) throw new Error("같은 거래처 정류장이 중복되었습니다.");
    const order = input.orderRead.orderRefsByCustomerId[stop.customerId];
    const routeStop: StageDRouteStop = {
      ...stop,
      deliveryDate: input.deliveryDate,
      orderIds: order?.orderIds || [],
      orderRevisions: order?.orderRevisions || {},
      ...(order?.conflict ? { conflict: order.conflict } : {})
    };
    stopByCustomerId.set(stop.customerId, routeStop);
    return routeStop;
  });

  const orderReads = Object.values(input.orderRead.orderRefsByCustomerId);
  const blocked = orderReads.filter((order) => order.conflict === "destination_mismatch");
  const unassigned = orderReads.filter((order) => !order.conflict && !stopByCustomerId.has(order.customerId));
  const history: StageDDeliveryFlow["history"] = [];
  const eventIds = new Set<string>();

  for (const event of input.completionEvents) {
    if (event.companyId !== input.companyId) throw new Error("다른 회사의 완료 이벤트를 연결할 수 없습니다.");
    if (event.deliveryDate !== input.deliveryDate) continue;
    if (!event.eventId.trim() || Number.isNaN(Date.parse(event.completedAt))) throw new Error("완료 이벤트를 확인해 주세요.");
    if (eventIds.has(event.eventId)) throw new Error("완료 이벤트 ID가 중복되었습니다.");
    eventIds.add(event.eventId);

    const stop = stopByCustomerId.get(event.customerId);
    if (!stop) throw new Error("미배정 주문을 완료할 수 없습니다.");
    if (stop.conflict) throw new Error("배송지 충돌 주문을 완료할 수 없습니다.");
    if (stableIds(event.orderIds).join("|") !== stableIds(stop.orderIds).join("|")) {
      throw new Error("완료 이벤트의 주문 ID가 정류장과 다릅니다.");
    }

    stop.completionEventId = event.eventId;
    stop.completedAt = event.completedAt;
    history.push({
      completionEventId: event.eventId,
      customerId: stop.customerId,
      deliveryDate: input.deliveryDate,
      orderIds: stableIds(event.orderIds),
      completedAt: event.completedAt,
      driverId: stop.driverId,
      vehicleId: stop.vehicleId
    });
  }

  return { routeStops, unassigned, blocked, history };
}

function stableIds(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}
