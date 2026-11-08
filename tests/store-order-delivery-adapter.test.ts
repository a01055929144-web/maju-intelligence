import { describe, expect, it } from "vitest";
import {
  toOrderDeliveryCandidates,
  type StoreOrderDeliveryRow
} from "../application/delivery/store-order-delivery-adapter";

const baseRow: StoreOrderDeliveryRow = {
  id: "order-a",
  company_id: "company-a",
  customer_id: "customer-a",
  delivery_date: "2026-11-08",
  revision: 2,
  status: "submitted",
  delivery_customer_name_snapshot: "가 매장",
  delivery_address_snapshot: "서울 강남구 테헤란로 1",
  delivery_address_detail_snapshot: "101호",
  delivery_recipient_phone_snapshot: "010-1111-2222",
  delivery_loading_position_snapshot: "후문 냉장고 앞"
};

describe("store order delivery adapter", () => {
  it("maps the read-only order and destination fields into the delivery DTO", () => {
    expect(toOrderDeliveryCandidates([baseRow])).toEqual({
      candidates: [{
        companyId: "company-a",
        orderId: "order-a",
        customerId: "customer-a",
        deliveryDate: "2026-11-08",
        orderRevision: 2,
        destination: {
          customerName: "가 매장",
          address: "서울 강남구 테헤란로 1",
          addressDetail: "101호",
          recipientPhone: "010-1111-2222",
          loadingPosition: "후문 냉장고 앞"
        }
      }],
      blocked: []
    });
  });

  it("keeps multiple active orders and does not add route or driver assignments", () => {
    const result = toOrderDeliveryCandidates([
      baseRow,
      { ...baseRow, id: "order-b", revision: 1, status: "received" }
    ]);

    expect(result.candidates.map((candidate) => candidate.orderId)).toEqual(["order-a", "order-b"]);
    expect(result.candidates.every((candidate) => !("driverId" in candidate) && !("routeId" in candidate))).toBe(true);
    expect(result.blocked).toEqual([]);
  });

  it("excludes cancelled and delivered orders without mutating the source rows", () => {
    const rows: StoreOrderDeliveryRow[] = [
      { ...baseRow, status: "cancelled" },
      { ...baseRow, id: "order-b", status: "delivered" }
    ];
    const before = structuredClone(rows);

    expect(toOrderDeliveryCandidates(rows)).toEqual({ candidates: [], blocked: [] });
    expect(rows).toEqual(before);
  });

  it("returns zero candidates for current store_orders rows without snapshot columns", () => {
    const currentStoreOrder: StoreOrderDeliveryRow = {
      id: "legacy-order",
      company_id: "company-a",
      customer_id: "customer-a",
      delivery_date: "2026-11-08",
      revision: 1,
      status: "submitted"
    };

    expect(toOrderDeliveryCandidates([currentStoreOrder])).toEqual({
      candidates: [],
      blocked: [{ orderId: "legacy-order", reason: "missing_delivery_snapshot" }]
    });
  });

  it("keeps the order-time address after the customer master address changes", () => {
    const changedCustomerAddress = "서울 송파구 올림픽로 2";
    const result = toOrderDeliveryCandidates([baseRow]);

    expect(changedCustomerAddress).not.toBe(baseRow.delivery_address_snapshot);
    expect(result.candidates[0].destination.address).toBe("서울 강남구 테헤란로 1");
  });

  it("rejects invalid order identifiers before they reach the route consumer", () => {
    expect(() => toOrderDeliveryCandidates([{ ...baseRow, revision: 0 }])).toThrow("revision");
  });
});
