import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTodayRouteOrderProjection, projectOrderRefsOntoExistingRoute } from "../application/route/today-route-order-projection";
import { buildOrderRouteConsumer } from "../application/delivery/order-route-consumer";
import type { RoutePlan } from "../lib/store";

const routePlan: RoutePlan = {
  groups: [{ region: "서울", stops: [{ id: "customer-a", name: "기존 코스", region: "서울", score: 80, status: "today", expectedRevenue: 10, order: 1 }], expectedRevenue: 10, totalDistanceKm: 1, totalDurationMinutes: 10 }],
  source: "supabase",
  totalDistanceKm: 1,
  totalDurationMinutes: 10,
  totalExpectedRevenue: 10,
  totalStops: 1
};

afterEach(() => vi.unstubAllEnvs());

describe("today route order projection", () => {
  it("keeps the manual route and attaches exact order IDs and revisions without auto-assigning orders", () => {
    const orderRead = buildOrderRouteConsumer({
      companyId: "company-a",
      deliveryDate: "2026-11-08",
      existingCustomerIds: ["customer-a"],
      candidates: [
        { companyId: "company-a", customerId: "customer-a", orderId: "order-a", orderRevision: 2, deliveryDate: "2026-11-08", destination: { customerName: "기존 코스", address: "서울" } },
        { companyId: "company-a", customerId: "customer-a", orderId: "order-b", orderRevision: 3, deliveryDate: "2026-11-08", destination: { customerName: "기존 코스", address: "서울" } },
        { companyId: "company-a", customerId: "customer-unassigned", orderId: "order-c", orderRevision: 1, deliveryDate: "2026-11-08", destination: { customerName: "미배정", address: "부산" } }
      ]
    });

    const projected = projectOrderRefsOntoExistingRoute(routePlan, orderRead);
    expect(projected.totalStops).toBe(1);
    expect(projected.groups[0].stops).toEqual([expect.objectContaining({
      id: "customer-a",
      orderIds: ["order-a", "order-b"],
      orderRevisions: { "order-a": 2, "order-b": 3 }
    })]);
  });

  it("does no read and returns the original route while the company rollout is off", async () => {
    const request = vi.fn();
    const result = await loadTodayRouteOrderProjection("company-a", routePlan, "2026-11-08", request);
    expect(result).toEqual({ routePlan, status: "off" });
    expect(request).not.toHaveBeenCalled();
  });

  it("fails closed on permission or schema errors and preserves the manual route", async () => {
    vi.stubEnv("FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS", "company-a");
    const result = await loadTodayRouteOrderProjection("company-a", routePlan, "2026-11-08", vi.fn().mockRejectedValue(new Error("permission denied")));
    expect(result).toEqual({ routePlan, status: "unavailable" });
  });

  it("reads only the session company and service date", async () => {
    vi.stubEnv("FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS", "company-a");
    const request = vi.fn().mockResolvedValue([]);
    const result = await loadTodayRouteOrderProjection("company-a", routePlan, "2026-11-08", request);
    expect(result.status).toBe("ready");
    expect(request.mock.calls[0][0]).toContain("company_id=eq.company-a&delivery_date=eq.2026-11-08");
  });

  it("keeps the projected manual route but exposes a completion-history permission error", async () => {
    vi.stubEnv("FEATURE_STAGE_D_ORDER_IDS_COMPANY_IDS", "company-a");
    const request = vi.fn(async <T>(path: string): Promise<T> => {
      if (path.startsWith("store_orders") && path.includes("status=in.")) return [{
        id: "order-a", company_id: "company-a", customer_id: "customer-a", delivery_date: "2026-11-08", revision: 2, status: "in_delivery",
        delivery_customer_name_snapshot: "기존 코스", delivery_address_snapshot: "서울",
        delivery_address_detail_snapshot: null, delivery_recipient_phone_snapshot: null, delivery_loading_position_snapshot: null
      }] as T;
      throw new Error("permission denied");
    });

    const result = await loadTodayRouteOrderProjection("company-a", routePlan, "2026-11-08", request);
    expect(result.status).toBe("unavailable");
    expect(result.routePlan.groups[0].stops[0]).toMatchObject({ id: "customer-a", orderIds: ["order-a"] });
  });
});
