import { describe, expect, it } from "vitest";
import { aggregateFulfillment, buildFulfillmentLines } from "../domains/order/fulfillment";

describe("CX-66 fulfillment read model", () => {
  it("groups accepted quantities by delivery date, territory, vehicle and product", () => {
    const rows = aggregateFulfillment(buildFulfillmentLines([
      { orderId: "o1", customerName: "가게 A", deliveryDate: "2026-11-18", territory: "동부", vehicle: "1호차", requestMemo: "", productId: "p1", productName: "양파", specification: "15kg", unit: "망", quantity: 2, marketPrice: false, trackingEnabled: true, supplierNames: [] },
      { orderId: "o2", customerName: "가게 B", deliveryDate: "2026-11-18", territory: "동부", vehicle: "1호차", requestMemo: "", productId: "p1", productName: "양파", specification: "15kg", unit: "망", quantity: 3, marketPrice: false, trackingEnabled: true, supplierNames: [] },
    ]));
    expect(rows).toMatchObject([{ quantity: 5, storeCount: 2, mode: "inventory" }]);
  });

  it("keeps market and purchase lines in order targets without inventing stock state", () => {
    const lines = buildFulfillmentLines([
      { orderId: "o1", customerName: "가게", deliveryDate: "2026-11-18", territory: "권역 미배정", vehicle: "호차 미배정", requestMemo: "", productId: "p1", productName: "꽃게", specification: "", unit: "kg", quantity: 1, marketPrice: true, trackingEnabled: true, supplierNames: ["수산시장"] },
      { orderId: "o1", customerName: "가게", deliveryDate: "2026-11-18", territory: "권역 미배정", vehicle: "호차 미배정", requestMemo: "", productId: "p2", productName: "떡", specification: "", unit: "팩", quantity: 4, marketPrice: false, trackingEnabled: false, supplierNames: [] },
    ]);
    expect(lines.map((line) => [line.mode, line.supplier])).toEqual([["market", "수산시장"], ["purchase", "매입처 미등록"]]);
  });
});
