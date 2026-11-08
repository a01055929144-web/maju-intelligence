import { describe, expect, it } from "vitest";
import { buildOrderRouteConsumer, type OrderDeliveryCandidate } from "../application/delivery/order-route-consumer";

const baseOrder: OrderDeliveryCandidate = {
  companyId: "company-a",
  orderId: "order-a",
  customerId: "customer-a",
  deliveryDate: "2026-11-08",
  orderRevision: 1,
  destination: {
    customerName: "가 매장",
    address: "서울 강남구 테헤란로 1",
    loadingPosition: "후문"
  }
};

function build(candidates: OrderDeliveryCandidate[], existingCustomerIds = ["manual-customer"]) {
  return buildOrderRouteConsumer({
    companyId: "company-a",
    deliveryDate: "2026-11-08",
    candidates,
    existingCustomerIds
  });
}

describe("order route consumer", () => {
  it("groups multiple orders for the same store and keeps stable order ids", () => {
    const result = build([{ ...baseOrder, orderId: "order-b", orderRevision: 2 }, baseOrder]);

    expect(result.orderRefsByCustomerId["customer-a"]).toMatchObject({
      orderIds: ["order-a", "order-b"],
      orderRevisions: { "order-a": 1, "order-b": 2 }
    });
    expect(result.visibleCustomerIds).toEqual(["manual-customer", "customer-a"]);
  });

  it("preserves manual stops when there are no order candidates", () => {
    expect(build([])).toEqual({
      blockedCustomerIds: [],
      orderRefsByCustomerId: {},
      visibleCustomerIds: ["manual-customer"]
    });
  });

  it("keeps a manual stop after all automatic orders disappear", () => {
    const result = build([], ["customer-a"]);
    expect(result.visibleCustomerIds).toEqual(["customer-a"]);
  });

  it("ignores candidates for another delivery date", () => {
    const result = build([{ ...baseOrder, deliveryDate: "2026-11-09" }]);
    expect(result.orderRefsByCustomerId).toEqual({});
    expect(result.visibleCustomerIds).toEqual(["manual-customer"]);
  });

  it("blocks automatic route inclusion when destination snapshots disagree", () => {
    const result = build([
      baseOrder,
      { ...baseOrder, orderId: "order-b", destination: { ...baseOrder.destination, address: "서울 송파구 올림픽로 2" } }
    ], []);

    expect(result.blockedCustomerIds).toEqual(["customer-a"]);
    expect(result.visibleCustomerIds).toEqual([]);
    expect(result.orderRefsByCustomerId["customer-a"].conflict).toBe("destination_mismatch");
  });

  it("deduplicates identical retried candidates", () => {
    const result = build([baseOrder, { ...baseOrder }]);
    expect(result.orderRefsByCustomerId["customer-a"].orderIds).toEqual(["order-a"]);
  });

  it("rejects conflicting data for the same order id", () => {
    expect(() => build([baseOrder, { ...baseOrder, orderRevision: 2 }])).toThrow("같은 주문 ID");
  });

  it("rejects the same order id assigned to different customers", () => {
    expect(() => build([
      baseOrder,
      { ...baseOrder, customerId: "customer-b", destination: { ...baseOrder.destination, customerName: "나 매장" } }
    ])).toThrow("여러 거래처");
  });

  it("rejects candidates from another company", () => {
    expect(() => build([{ ...baseOrder, companyId: "company-b" }])).toThrow("다른 회사");
  });

  it("rejects invalid consumer inputs before building a route", () => {
    expect(() => build([{ ...baseOrder, orderRevision: 0 }])).toThrow("revision");
    expect(() => buildOrderRouteConsumer({
      companyId: "company-a",
      deliveryDate: "2026/11/08",
      candidates: [],
      existingCustomerIds: []
    })).toThrow("배송일");
  });
});
