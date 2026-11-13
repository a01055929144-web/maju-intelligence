import { describe, expect, it } from "vitest";
import { buildOrderDeliveryCompletionCommand } from "../application/delivery/order-delivery-completion-command";
import type { StageDRouteStop } from "../application/delivery/stage-d-delivery-flow";

const stop: StageDRouteStop = {
  customerId: "customer-a",
  driverId: "driver-a",
  vehicleId: "vehicle-a",
  deliveryDate: "2026-11-08",
  orderIds: ["order-a", "order-b"],
  orderRevisions: { "order-a": 1, "order-b": 2 }
};

function build(selectedOrderIds: string[], routeStop: StageDRouteStop = stop) {
  return buildOrderDeliveryCompletionCommand({
    companyId: "company-a",
    stop: routeStop,
    selectedOrderIds,
    completionEventId: "completion-a",
    idempotencyKey: "attempt-a",
    completedAt: "2026-11-08T03:00:00.000Z",
    noteId: "note-a",
    attachmentIds: ["attachment-b", "attachment-a", "attachment-a"]
  });
}

describe("order delivery completion command", () => {
  it("builds a partial completion with the selected order revision and existing proof", () => {
    expect(build(["order-a"])).toEqual({
      companyId: "company-a",
      customerId: "customer-a",
      deliveryDate: "2026-11-08",
      completionEventId: "completion-a",
      idempotencyKey: "attempt-a",
      completedAt: "2026-11-08T03:00:00.000Z",
      orders: [{ orderId: "order-a", orderRevision: 1 }],
      proof: { noteId: "note-a", attachmentIds: ["attachment-a", "attachment-b"] }
    });
  });

  it("keeps multiple selected orders stable", () => {
    expect(build(["order-b", "order-a"]).orders).toEqual([
      { orderId: "order-a", orderRevision: 1 },
      { orderId: "order-b", orderRevision: 2 }
    ]);
  });

  it("rejects unassigned, cancelled or missing-revision orders", () => {
    expect(() => build(["order-c"])).toThrow("배정되지 않았거나 취소된 주문");
    expect(() => build(["order-a"], { ...stop, orderIds: [] })).toThrow("배정된 주문이 없는 정류장");
    expect(() => build(["order-a"], { ...stop, orderRevisions: {} })).toThrow("revision");
  });

  it("rejects destination conflicts and empty selections", () => {
    expect(() => build(["order-a"], { ...stop, conflict: "destination_mismatch" })).toThrow("배송지 충돌");
    expect(() => build([])).toThrow("주문 ID");
  });
});
