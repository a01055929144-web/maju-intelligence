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
  normalized_customers: {
    customer_name: "가 매장",
    address: "서울 강남구 테헤란로 1",
    delivery_contact_phone: "010-1111-2222",
    phone: "02-111-2222",
    delivery_drop_location: "후문 냉장고 앞",
    loading_position: "후문"
  }
};

describe("store order delivery adapter", () => {
  it("maps the read-only order and destination fields into the delivery DTO", () => {
    expect(toOrderDeliveryCandidates([baseRow])).toEqual([{
      companyId: "company-a",
      orderId: "order-a",
      customerId: "customer-a",
      deliveryDate: "2026-11-08",
      orderRevision: 2,
      destination: {
        customerName: "가 매장",
        address: "서울 강남구 테헤란로 1",
        recipientPhone: "010-1111-2222",
        loadingPosition: "후문 냉장고 앞"
      }
    }]);
  });

  it("keeps multiple active orders and does not add route or driver assignments", () => {
    const result = toOrderDeliveryCandidates([
      baseRow,
      { ...baseRow, id: "order-b", revision: 1, status: "received" }
    ]);

    expect(result.map((candidate) => candidate.orderId)).toEqual(["order-a", "order-b"]);
    expect(result.every((candidate) => !("driverId" in candidate) && !("routeId" in candidate))).toBe(true);
  });

  it("excludes cancelled and delivered orders without mutating the source rows", () => {
    const rows: StoreOrderDeliveryRow[] = [
      { ...baseRow, status: "cancelled" },
      { ...baseRow, id: "order-b", status: "delivered" }
    ];
    const before = structuredClone(rows);

    expect(toOrderDeliveryCandidates(rows)).toEqual([]);
    expect(rows).toEqual(before);
  });

  it("falls back to the existing customer phone and loading position", () => {
    const result = toOrderDeliveryCandidates([{
      ...baseRow,
      normalized_customers: {
        ...baseRow.normalized_customers,
        delivery_contact_phone: null,
        delivery_drop_location: null
      }
    }]);

    expect(result[0].destination).toMatchObject({
      recipientPhone: "02-111-2222",
      loadingPosition: "후문"
    });
  });

  it("rejects incomplete delivery rows before they reach the route consumer", () => {
    expect(() => toOrderDeliveryCandidates([{ ...baseRow, revision: 0 }])).toThrow("revision");
    expect(() => toOrderDeliveryCandidates([{
      ...baseRow,
      normalized_customers: { ...baseRow.normalized_customers, address: null }
    }])).toThrow("배송지");
  });
});
