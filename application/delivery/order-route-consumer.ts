export type OrderDeliveryDestination = {
  customerName: string;
  address: string;
  addressDetail?: string;
  recipientPhone?: string;
  loadingPosition?: string;
};

export type OrderDeliveryCandidate = {
  companyId: string;
  orderId: string;
  customerId: string;
  deliveryDate: string;
  orderRevision: number;
  destination: OrderDeliveryDestination;
};

export type RouteStopOrderRead = {
  customerId: string;
  deliveryDate: string;
  orderIds: string[];
  orderRevisions: Record<string, number>;
  destination: OrderDeliveryDestination;
  conflict?: "destination_mismatch";
};

export type OrderRouteConsumerResult = {
  blockedCustomerIds: string[];
  orderRefsByCustomerId: Record<string, RouteStopOrderRead>;
  visibleCustomerIds: string[];
};

export function buildOrderRouteConsumer(input: {
  companyId: string;
  deliveryDate: string;
  candidates: OrderDeliveryCandidate[];
  existingCustomerIds: string[];
}): OrderRouteConsumerResult {
  if (!input.companyId.trim()) throw new Error("회사 ID가 필요합니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDate)) throw new Error("배송일을 확인해 주세요.");

  const visibleCustomerIds = uniqueNonEmpty(input.existingCustomerIds);
  const grouped = new Map<string, OrderDeliveryCandidate[]>();

  for (const candidate of input.candidates) {
    if (candidate.companyId !== input.companyId) throw new Error("다른 회사의 주문은 코스에 연결할 수 없습니다.");
    if (!candidate.orderId.trim() || !candidate.customerId.trim()) throw new Error("주문 ID와 거래처 ID가 필요합니다.");
    if (!Number.isInteger(candidate.orderRevision) || candidate.orderRevision < 1) throw new Error("주문 revision을 확인해 주세요.");
    if (candidate.deliveryDate !== input.deliveryDate) continue;
    grouped.set(candidate.customerId, [...(grouped.get(candidate.customerId) || []), candidate]);
  }

  const blockedCustomerIds: string[] = [];
  const orderRefsByCustomerId: Record<string, RouteStopOrderRead> = {};

  grouped.forEach((candidates, customerId) => {
    const byOrderId = new Map<string, OrderDeliveryCandidate>();
    for (const candidate of candidates) {
      const previous = byOrderId.get(candidate.orderId);
      if (previous && candidateSignature(previous) !== candidateSignature(candidate)) {
        throw new Error("같은 주문 ID의 배송 정보가 서로 다릅니다.");
      }
      byOrderId.set(candidate.orderId, candidate);
    }

    const orders = Array.from(byOrderId.values()).sort((left, right) => left.orderId.localeCompare(right.orderId));
    const destination = orders[0].destination;
    const hasDestinationMismatch = orders.some((order) => destinationSignature(order.destination) !== destinationSignature(destination));
    const orderIds = orders.map((order) => order.orderId);

    orderRefsByCustomerId[customerId] = {
      customerId,
      deliveryDate: input.deliveryDate,
      orderIds,
      orderRevisions: Object.fromEntries(orders.map((order) => [order.orderId, order.orderRevision])),
      destination,
      ...(hasDestinationMismatch ? { conflict: "destination_mismatch" as const } : {})
    };

    if (hasDestinationMismatch) {
      blockedCustomerIds.push(customerId);
    } else if (!visibleCustomerIds.includes(customerId)) {
      visibleCustomerIds.push(customerId);
    }
  });

  return { blockedCustomerIds, orderRefsByCustomerId, visibleCustomerIds };
}

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function destinationSignature(destination: OrderDeliveryDestination) {
  return [
    destination.customerName,
    destination.address,
    destination.addressDetail,
    destination.recipientPhone,
    destination.loadingPosition
  ].map(normalizeText).join("|");
}

function candidateSignature(candidate: OrderDeliveryCandidate) {
  return [candidate.companyId, candidate.customerId, candidate.deliveryDate, candidate.orderRevision, destinationSignature(candidate.destination)].join("|");
}

function normalizeText(value?: string) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}
