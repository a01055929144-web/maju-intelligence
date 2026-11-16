import { describe, expect, it, vi } from "vitest";
import { buildTodayRoutePlan, readRouteOrderConfirmationMap } from "./read";

const customers = [
  {
    id: "customer-a",
    address: "서울 A",
    customerName: "A 거래처",
    deliveryKm: 2.25,
    deliveryManager: "김배송",
    grade: "A" as const,
    industry: "한식",
    monthlyRevenue: 100,
    region: "서울"
  },
  {
    id: "customer-b",
    address: "서울 B",
    customerName: "B 거래처",
    deliveryKm: 3.35,
    deliveryManager: "김배송",
    grade: "B" as const,
    industry: "중식",
    monthlyRevenue: 200,
    region: "서울"
  },
  {
    id: "customer-c",
    address: "경기 C",
    customerName: "C 거래처",
    deliveryKm: 5,
    deliveryManager: "박배송",
    grade: "C" as const,
    industry: "카페",
    monthlyRevenue: 50,
    region: "경기"
  }
];

describe("route reads", () => {
  it("reads company/date-scoped confirmations and ignores invalid customer lists", async () => {
    const request = vi.fn(async () => [
      { driver_name: "김배송", customer_ids: ["customer-b", "customer-a"] },
      { driver_name: "박배송", customer_ids: null }
    ]);

    const result = await readRouteOrderConfirmationMap(request, "company/a", "2026-11-17");

    expect(request).toHaveBeenCalledWith(
      "route_plan_confirmations?select=driver_name,customer_ids&company_id=eq.company%2Fa&route_date=eq.2026-11-17"
    );
    expect(Array.from(result)).toEqual([["김배송", ["customer-b", "customer-a"]]]);
  });

  it("keeps the existing route when confirmation reading fails", async () => {
    const result = await readRouteOrderConfirmationMap(async () => Promise.reject(new Error("offline")), "company", "2026-11-17");
    expect(result.size).toBe(0);
  });

  it("projects confirmed stops in confirmed order without changing unconfirmed drivers", () => {
    const result = buildTodayRoutePlan(
      customers,
      "supabase",
      new Map([["서울 B", { calculatedAt: "방금", distanceKm: 1.2, durationMinutes: 7 }]]),
      new Map([["김배송", ["customer-b"]]]),
      new Map([["customer-b", "서울 B 2층"]])
    );

    expect(result.totalStops).toBe(2);
    expect(result.groups.flatMap((group) => group.stops).map((stop) => [stop.id, stop.order])).toEqual([
      ["customer-b", 1],
      ["customer-c", 3]
    ]);
    expect(result.groups[0].stops[0]).toMatchObject({
      id: "customer-b",
      distanceKm: 1.2,
      durationMinutes: 7,
      routeCalculatedAt: "방금",
      routeProvider: "cached",
      deliveryAddress: "서울 B 2층"
    });
    expect(result.totalDistanceKm).toBe(6.2);
  });
});
