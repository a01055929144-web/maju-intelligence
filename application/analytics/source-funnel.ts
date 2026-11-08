export type SourceFunnelInput = {
  sends: Array<{ id: string; companyId: string; documentVersionId: string; acceptanceStatus: string }>;
  acceptances: Array<{ id: string; companyId: string; sendId: string | null; customerId: string | null; documentVersionId: string }>;
  links: Array<{ id: string; companyId: string; acceptanceRequestId: string | null; customerId: string; documentVersionId: string }>;
  orders: Array<{ id: string; companyId: string; linkId: string; customerId: string; documentVersionId: string; status: string; submittedAt: string }>;
};

export type SourceFunnelRow = {
  companyId: string;
  sendId: string;
  sendStatus: string;
  acceptanceRequestId?: string;
  customerId?: string;
  linkId?: string;
  orders: Array<{ id: string; submittedAt: string }>;
};

type AvailableMetric = { state: "available"; value: number };
type UnavailableMetric = { state: "unavailable"; reason: "delivery_source_id_missing" | "revenue_source_id_missing" };

export type SourceFunnelMetrics = {
  documentsSent: AvailableMetric;
  documentsViewed: AvailableMetric;
  documentsAccepted: AvailableMetric;
  firstOrders: AvailableMetric;
  repeatOrders: AvailableMetric;
  deliveriesCompleted: UnavailableMetric;
  revenueRecorded: UnavailableMetric;
};

/** Joins only explicit source IDs. Missing or mismatched links stay unconnected. */
export function joinSourceFunnel(input: SourceFunnelInput): SourceFunnelRow[] {
  return input.sends.map((send) => {
    const acceptance = only(input.acceptances.filter((row) =>
      row.companyId === send.companyId && row.sendId === send.id && row.documentVersionId === send.documentVersionId
    ));
    const link = acceptance && acceptance.customerId
      ? only(input.links.filter((row) => row.companyId === send.companyId && row.acceptanceRequestId === acceptance.id
        && row.customerId === acceptance.customerId && row.documentVersionId === send.documentVersionId))
      : undefined;
    const orders = link ? input.orders.filter((row) => row.companyId === send.companyId && row.linkId === link.id
      && row.customerId === link.customerId && row.documentVersionId === send.documentVersionId && row.status !== "cancelled")
      .map((row) => ({ id: row.id, submittedAt: row.submittedAt })).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id)) : [];

    return {
      companyId: send.companyId,
      sendId: send.id,
      sendStatus: send.acceptanceStatus,
      ...(acceptance ? { acceptanceRequestId: acceptance.id } : {}),
      ...(link ? { customerId: link.customerId, linkId: link.id } : {}),
      orders
    };
  });
}

function only<T>(rows: T[]) {
  return rows.length === 1 ? rows[0] : undefined;
}

export function summarizeSourceFunnel(rows: SourceFunnelRow[]): SourceFunnelMetrics {
  const ordersByCustomer = new Map<string, Map<string, string>>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const key = `${row.companyId}:${row.customerId}`;
    const orders = ordersByCustomer.get(key) || new Map<string, string>();
    for (const order of row.orders) orders.set(order.id, order.submittedAt);
    ordersByCustomer.set(key, orders);
  }
  const orderCounts = [...ordersByCustomer.values()].map((orders) => orders.size).filter(Boolean);
  return {
    documentsSent: { state: "available", value: new Set(rows.map((row) => `${row.companyId}:${row.sendId}`)).size },
    documentsViewed: { state: "available", value: new Set(rows.filter((row) => ["viewed", "accepted"].includes(row.sendStatus)).map((row) => `${row.companyId}:${row.sendId}`)).size },
    documentsAccepted: { state: "available", value: new Set(rows.flatMap((row) => row.acceptanceRequestId ? [`${row.companyId}:${row.acceptanceRequestId}`] : [])).size },
    firstOrders: { state: "available", value: orderCounts.length },
    repeatOrders: { state: "available", value: orderCounts.reduce((total, count) => total + Math.max(0, count - 1), 0) },
    deliveriesCompleted: { state: "unavailable", reason: "delivery_source_id_missing" },
    revenueRecorded: { state: "unavailable", reason: "revenue_source_id_missing" }
  };
}
