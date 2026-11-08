import { buildOrderRouteConsumer, type OrderRouteConsumerResult } from "../delivery/order-route-consumer";
import { toOrderDeliveryCandidates, type StoreOrderDeliveryRow } from "../delivery/store-order-delivery-adapter";
import { isFeatureEnabled } from "../../lib/feature-flags";
import { supabaseRequest, type RoutePlan, type RoutePlanGroup, type RoutePlanStop } from "../../lib/store";
import { loadTodayRouteCompletionReadModel, type RouteCompletionSummary } from "./today-route-completion-read-model";

export type RouteOrderLinkStatus = "off" | "ready" | "partial" | "unavailable";
export type RouteOrderFields = { completionHistory?: RouteCompletionSummary[]; orderIds?: string[]; orderRevisions?: Record<string, number> };
export type OrderLinkedRoutePlan = Omit<RoutePlan, "groups"> & {
  groups: Array<Omit<RoutePlanGroup, "stops"> & { stops: Array<RoutePlanStop & RouteOrderFields> }>;
};

export function projectOrderRefsOntoExistingRoute(routePlan: RoutePlan, orderRead: OrderRouteConsumerResult): OrderLinkedRoutePlan {
  return {
    ...routePlan,
    groups: routePlan.groups.map((group) => ({
      ...group,
      stops: group.stops.map((stop) => {
        const order = orderRead.orderRefsByCustomerId[stop.id];
        return order && !order.conflict
          ? { ...stop, orderIds: order.orderIds, orderRevisions: order.orderRevisions }
          : stop;
      })
    }))
  };
}

export async function loadTodayRouteOrderProjection(
  companyId: string,
  routePlan: RoutePlan,
  date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
  request = supabaseRequest
): Promise<{ routePlan: OrderLinkedRoutePlan; status: RouteOrderLinkStatus }> {
  if (!isFeatureEnabled("STAGE_D_ORDER_IDS", companyId)) return { routePlan, status: "off" };

  try {
    const rows = await request<StoreOrderDeliveryRow[]>(
      `store_orders?select=id,company_id,customer_id,delivery_date,revision,status,delivery_customer_name_snapshot,delivery_address_snapshot,delivery_address_detail_snapshot,delivery_recipient_phone_snapshot,delivery_loading_position_snapshot&company_id=eq.${encodeURIComponent(companyId)}&delivery_date=eq.${date}&status=in.(submitted,received,in_delivery)&limit=1000`
    );
    const deliveryRead = toOrderDeliveryCandidates(rows);
    const orderRead = buildOrderRouteConsumer({
      candidates: deliveryRead.candidates,
      companyId,
      deliveryDate: date,
      existingCustomerIds: routePlan.groups.flatMap((group) => group.stops.map((stop) => stop.id))
    });
    const projected = projectOrderRefsOntoExistingRoute(routePlan, orderRead);
    const completions = await loadTodayRouteCompletionReadModel(companyId, projected, date, request);
    return {
      routePlan: {
        ...projected,
        groups: projected.groups.map((group) => ({
          ...group,
          stops: group.stops.map((stop) => completions.byCustomerId[stop.id]?.length
            ? { ...stop, completionHistory: completions.byCustomerId[stop.id] }
            : stop)
        }))
      },
      status: deliveryRead.blocked.length || orderRead.blockedCustomerIds.length || completions.status === "unavailable" ? "partial" : "ready"
    };
  } catch {
    return { routePlan, status: "unavailable" };
  }
}
