import { describe, expect, it } from "vitest";
import { buildOrderRouteConsumer, type OrderDeliveryCandidate } from "../application/delivery/order-route-consumer";
import { buildStageDDeliveryFlow } from "../application/delivery/stage-d-delivery-flow";

const order: OrderDeliveryCandidate = {
  companyId: "company-a",
  orderId: "order-a",
  customerId: "customer-a",
  deliveryDate: "2026-11-08",
  orderRevision: 1,
  destination: { customerName: "가 매장", address: "서울 강남구 1" }
};

function orderRead(candidates: OrderDeliveryCandidate[], existingCustomerIds: string[] = []) {
  return buildOrderRouteConsumer({
    companyId: "company-a",
    deliveryDate: "2026-11-08",
    candidates,
    existingCustomerIds
  });
}

function build(input: Partial<Parameters<typeof buildStageDDeliveryFlow>[0]> = {}) {
  return buildStageDDeliveryFlow({
    companyId: "company-a",
    deliveryDate: "2026-11-08",
    existingStops: [{ customerId: "manual-customer", driverId: "driver-a", vehicleId: "vehicle-a" }],
    orderRead: orderRead([]),
    completionEvents: [],
    ...input
  });
}

describe("Stage D synthetic delivery flow", () => {
  it("preserves manual stops, order ids, drivers and vehicles when there are no candidates", () => {
    expect(build()).toMatchObject({
      routeStops: [{
        customerId: "manual-customer",
        driverId: "driver-a",
        vehicleId: "vehicle-a",
        orderIds: [],
        orderRevisions: {}
      }],
      unassigned: [],
      history: []
    });
  });

  it("keeps the manual stop after cancelled orders disappear from the candidate input", () => {
    expect(build({ orderRead: orderRead([], ["manual-customer"]) }).routeStops.map((stop) => stop.customerId))
      .toEqual(["manual-customer"]);
  });

  it("reports new order customers as unassigned without automatically adding route stops", () => {
    const result = build({ orderRead: orderRead([order]) });

    expect(result.routeStops.map((stop) => stop.customerId)).toEqual(["manual-customer"]);
    expect(result.unassigned).toMatchObject([{ customerId: "customer-a", orderIds: ["order-a"] }]);
  });

  it("links multiple orders to an existing route without replacing its driver or vehicle", () => {
    const result = build({
      existingStops: [{ customerId: "customer-a", driverId: "driver-a", vehicleId: "vehicle-a" }],
      orderRead: orderRead([order, { ...order, orderId: "order-b", orderRevision: 2 }], ["customer-a"])
    });

    expect(result.routeStops[0]).toMatchObject({
      customerId: "customer-a",
      driverId: "driver-a",
      vehicleId: "vehicle-a",
      orderIds: ["order-a", "order-b"],
      orderRevisions: { "order-a": 1, "order-b": 2 }
    });
  });

  it("creates history only from an explicit completion event with matching order ids", () => {
    const result = build({
      existingStops: [{ customerId: "customer-a", driverId: "driver-a", vehicleId: "vehicle-a" }],
      orderRead: orderRead([order], ["customer-a"]),
      completionEvents: [{
        eventId: "completion-a",
        companyId: "company-a",
        customerId: "customer-a",
        deliveryDate: "2026-11-08",
        orderIds: ["order-a"],
        completedAt: "2026-11-08T03:00:00.000Z"
      }]
    });

    expect(result.routeStops[0]).toMatchObject({
      completionEventId: "completion-a",
      completedAt: "2026-11-08T03:00:00.000Z"
    });
    expect(result.history).toEqual([{
      completionEventId: "completion-a",
      customerId: "customer-a",
      deliveryDate: "2026-11-08",
      orderIds: ["order-a"],
      completedAt: "2026-11-08T03:00:00.000Z",
      driverId: "driver-a",
      vehicleId: "vehicle-a"
    }]);
  });

  it("keeps destination conflicts visible and blocks completion", () => {
    const conflictingRead = orderRead([
      order,
      { ...order, orderId: "order-b", destination: { ...order.destination, address: "서울 송파구 2" } }
    ], ["customer-a"]);
    const result = build({
      existingStops: [{ customerId: "customer-a", driverId: "driver-a", vehicleId: "vehicle-a" }],
      orderRead: conflictingRead
    });

    expect(result.routeStops[0].conflict).toBe("destination_mismatch");
    expect(result.blocked).toMatchObject([{ customerId: "customer-a", conflict: "destination_mismatch" }]);
    expect(() => buildStageDDeliveryFlow({
      companyId: "company-a",
      deliveryDate: "2026-11-08",
      existingStops: result.routeStops,
      orderRead: conflictingRead,
      completionEvents: [{
        eventId: "completion-a", companyId: "company-a", customerId: "customer-a",
        deliveryDate: "2026-11-08", orderIds: ["order-a", "order-b"], completedAt: "2026-11-08T03:00:00Z"
      }]
    })).toThrow("배송지 충돌");
  });

  it("rejects completion events for other companies, unassigned orders or different order ids", () => {
    const assigned = {
      existingStops: [{ customerId: "customer-a", driverId: "driver-a", vehicleId: "vehicle-a" }],
      orderRead: orderRead([order], ["customer-a"])
    };
    const event = {
      eventId: "completion-a", companyId: "company-a", customerId: "customer-a",
      deliveryDate: "2026-11-08", orderIds: ["order-a"], completedAt: "2026-11-08T03:00:00Z"
    };

    expect(() => build({ ...assigned, completionEvents: [{ ...event, companyId: "company-b" }] })).toThrow("다른 회사");
    expect(() => build({ orderRead: orderRead([order]), completionEvents: [event] })).toThrow("미배정");
    expect(() => build({ ...assigned, completionEvents: [{ ...event, orderIds: ["order-b"] }] })).toThrow("주문 ID");
    expect(() => build({ ...assigned, completionEvents: [{ ...event, orderIds: ["order-a", "order-a"] }] }))
      .toThrow("중복");
  });

  it("rejects order reads validated for a different company or delivery date", () => {
    const otherCompanyRead = buildOrderRouteConsumer({
      companyId: "company-b", deliveryDate: "2026-11-08", candidates: [], existingCustomerIds: []
    });
    const otherDateRead = buildOrderRouteConsumer({
      companyId: "company-a", deliveryDate: "2026-11-09", candidates: [], existingCustomerIds: []
    });

    expect(() => build({ orderRead: otherCompanyRead })).toThrow("회사·배송일");
    expect(() => build({ orderRead: otherDateRead })).toThrow("회사·배송일");
  });
});
