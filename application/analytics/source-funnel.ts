export type SourceFunnelInput = {
  sends: Array<{ id: string; companyId: string; documentVersionId: string }>;
  acceptances: Array<{ id: string; companyId: string; sendId: string | null; customerId: string | null; documentVersionId: string }>;
  links: Array<{ id: string; companyId: string; acceptanceRequestId: string | null; customerId: string; documentVersionId: string }>;
  orders: Array<{ id: string; companyId: string; linkId: string; customerId: string; documentVersionId: string }>;
};

export type SourceFunnelRow = {
  companyId: string;
  sendId: string;
  acceptanceRequestId?: string;
  linkId?: string;
  orderIds: string[];
};

type AvailableMetric = { state: "available"; value: number };
type UnavailableMetric = { state: "unavailable"; reason: "delivery_source_id_missing" };

export type SourceFunnelMetrics = {
  documentsSent: AvailableMetric;
  documentsAccepted: AvailableMetric;
  ordersPlaced: AvailableMetric;
  deliveriesCompleted: UnavailableMetric;
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
    const orderIds = link ? input.orders.filter((row) => row.companyId === send.companyId && row.linkId === link.id
      && row.customerId === link.customerId && row.documentVersionId === send.documentVersionId).map((row) => row.id).sort() : [];

    return {
      companyId: send.companyId,
      sendId: send.id,
      ...(acceptance ? { acceptanceRequestId: acceptance.id } : {}),
      ...(link ? { linkId: link.id } : {}),
      orderIds
    };
  });
}

function only<T>(rows: T[]) {
  return rows.length === 1 ? rows[0] : undefined;
}

export function summarizeSourceFunnel(rows: SourceFunnelRow[]): SourceFunnelMetrics {
  return {
    documentsSent: { state: "available", value: new Set(rows.map((row) => `${row.companyId}:${row.sendId}`)).size },
    documentsAccepted: { state: "available", value: new Set(rows.flatMap((row) => row.acceptanceRequestId ? [`${row.companyId}:${row.acceptanceRequestId}`] : [])).size },
    ordersPlaced: { state: "available", value: new Set(rows.flatMap((row) => row.orderIds.map((id) => `${row.companyId}:${id}`))).size },
    deliveriesCompleted: { state: "unavailable", reason: "delivery_source_id_missing" }
  };
}
