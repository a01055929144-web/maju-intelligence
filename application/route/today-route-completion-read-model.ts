import { isFeatureEnabled } from "../../lib/feature-flags";
import { supabaseRequest, type RoutePlan } from "../../lib/store";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

type DeliveredOrderRow = { customer_id: string; delivery_date: string; id: string; revision: number };
type CompletionOrderRow = { completed_revision: number; completion_event_id: string; order_id: string };
type CompletionRow = { completed_at: string; completion_event_id: string; customer_id: string; note_id: string };
type CompletionAttachmentRow = { attachment_id: string; completion_event_id: string; customer_id: string };

export type RouteCompletionSummary = {
  attachmentCount: number;
  completedAt: string;
  completionEventId: string;
  noteId: string;
  orderIds: string[];
  orderRevisions: Record<string, number>;
};

export type RouteCompletionRead = {
  byCustomerId: Record<string, RouteCompletionSummary[]>;
  status: "off" | "ready" | "unavailable";
};

export async function loadTodayRouteCompletionReadModel(
  companyId: string,
  routePlan: RoutePlan,
  deliveryDate: string,
  request: Request = supabaseRequest
): Promise<RouteCompletionRead> {
  if (!isFeatureEnabled("STAGE_D_ORDER_IDS", companyId)) return { byCustomerId: {}, status: "off" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return { byCustomerId: {}, status: "unavailable" };

  try {
    const company = encodeURIComponent(companyId);
    const date = encodeURIComponent(deliveryDate);
    const orders = await request<DeliveredOrderRow[]>(
      `store_orders?select=id,customer_id,delivery_date,revision&company_id=eq.${company}&delivery_date=eq.${date}&status=eq.delivered&limit=1000`
    );
    if (!orders.length) return { byCustomerId: {}, status: "ready" };

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const orderIds = Array.from(orderById.keys()).sort();
    const orderRelations = await request<CompletionOrderRow[]>(
      `store_order_delivery_completion_orders_09?select=completion_event_id,order_id,completed_revision&company_id=eq.${company}&order_id=in.(${orderIds.join(",")})&limit=1000`
    );
    const eventIds = Array.from(new Set(orderRelations.map((row) => row.completion_event_id))).sort();
    if (!eventIds.length) return { byCustomerId: {}, status: "ready" };

    const [events, attachments] = await Promise.all([
      request<CompletionRow[]>(
        `store_order_delivery_completions_09?select=completion_event_id,customer_id,completed_at,note_id&company_id=eq.${company}&completion_event_id=in.(${eventIds.join(",")})&limit=1000`
      ),
      request<CompletionAttachmentRow[]>(
        `store_order_delivery_completion_attachments_09?select=completion_event_id,customer_id,attachment_id&company_id=eq.${company}&completion_event_id=in.(${eventIds.join(",")})&limit=1000`
      )
    ]);
    if (events.length !== eventIds.length) throw new Error("completion event missing");

    const visibleCustomerIds = new Set(routePlan.groups.flatMap((group) => group.stops.map((stop) => stop.id)));
    const relationsByEvent = new Map<string, CompletionOrderRow[]>();
    for (const relation of orderRelations) {
      const order = orderById.get(relation.order_id);
      if (!order || order.delivery_date !== deliveryDate || relation.completed_revision !== order.revision) throw new Error("completion scope mismatch");
      relationsByEvent.set(relation.completion_event_id, [...(relationsByEvent.get(relation.completion_event_id) || []), relation]);
    }

    const attachmentCountByEvent = new Map<string, number>();
    for (const attachment of attachments) {
      attachmentCountByEvent.set(attachment.completion_event_id, (attachmentCountByEvent.get(attachment.completion_event_id) || 0) + 1);
    }

    const byCustomerId: RouteCompletionRead["byCustomerId"] = {};
    for (const event of events) {
      const relations = relationsByEvent.get(event.completion_event_id) || [];
      if (!relations.length || !event.note_id || Number.isNaN(Date.parse(event.completed_at)) || !attachmentCountByEvent.get(event.completion_event_id)) {
        throw new Error("completion event mismatch");
      }
      const eventOrders = relations.map((relation) => orderById.get(relation.order_id)!);
      if (eventOrders.some((order) => order.customer_id !== event.customer_id)) throw new Error("completion customer mismatch");
      if (attachments.some((attachment) => attachment.completion_event_id === event.completion_event_id && attachment.customer_id !== event.customer_id)) throw new Error("completion proof mismatch");
      if (!visibleCustomerIds.has(event.customer_id)) continue;
      const summary: RouteCompletionSummary = {
        attachmentCount: attachmentCountByEvent.get(event.completion_event_id) || 0,
        completedAt: event.completed_at,
        completionEventId: event.completion_event_id,
        noteId: event.note_id,
        orderIds: relations.map((relation) => relation.order_id).sort(),
        orderRevisions: Object.fromEntries(relations.map((relation) => [relation.order_id, relation.completed_revision]))
      };
      byCustomerId[event.customer_id] = [...(byCustomerId[event.customer_id] || []), summary];
    }

    Object.values(byCustomerId).forEach((items) => items.sort((left, right) => left.completedAt.localeCompare(right.completedAt)));
    return { byCustomerId, status: "ready" };
  } catch {
    return { byCustomerId: {}, status: "unavailable" };
  }
}
