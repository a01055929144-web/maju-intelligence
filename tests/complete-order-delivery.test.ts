import { describe, expect, it, vi } from "vitest";
import { completeOrderDelivery } from "../application/delivery/complete-order-delivery";
import type { OrderDeliveryCompletionCommand } from "../application/delivery/order-delivery-completion-command";

const companyId = "00000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const orderId = "30000000-0000-4000-8000-000000000001";
const eventId = "40000000-0000-4000-8000-000000000001";
const noteId = "50000000-0000-4000-8000-000000000001";
const attachmentId = "60000000-0000-4000-8000-000000000001";

const command: OrderDeliveryCompletionCommand = {
  companyId,
  customerId,
  deliveryDate: "2026-11-09",
  completionEventId: eventId,
  idempotencyKey: eventId,
  completedAt: "2026-11-09T03:00:00.000Z",
  orders: [{ orderId, orderRevision: 3 }],
  proof: { noteId, attachmentIds: [attachmentId] }
};
const actor = {
  actorKey: "member-a",
  companyId,
  driverKeys: ["기사 A"],
  staffMemberId: "staff-a",
  vehicleKeys: ["1호차"]
};

function repository(options: { customerId?: string; noteType?: string; responseAttachmentId?: string; route?: boolean; status?: string; vehicle?: string } = {}) {
  return vi.fn(async <T>(path: string, init?: RequestInit): Promise<T> => {
    let result: unknown;
    if (path.startsWith("route_plan_confirmations")) result = options.route === false ? [] : [{ driver_name: "기사 A", customer_ids: [customerId] }];
    else if (path.startsWith("normalized_customers")) result = [{ id: customerId, assigned_staff_member_id: "staff-a", delivery_manager: "기사 A", delivery_vehicle: options.vehicle || "1호차" }];
    else if (path.startsWith("store_orders")) result = [{ id: orderId, customer_id: options.customerId || customerId, delivery_date: "2026-11-09", revision: options.status === "delivered" ? 4 : 3, status: options.status || "in_delivery", delivery_customer_name_snapshot: "매장 A", delivery_address_snapshot: "서울" }];
    else if (path.startsWith("customer_notes")) result = [{ id: noteId, note_type: options.noteType || "delivery" }];
    else if (path.startsWith("customer_attachments")) result = [{ id: attachmentId, attachment_type: "delivery_proof" }];
    if (path === "rpc/complete_store_order_delivery_09") {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        p_actor_key: "member-a",
        p_company: companyId,
        p_completion_event_id: eventId,
        p_customer_id: customerId,
        p_expected_revisions: { [orderId]: 3 },
        p_note_id: noteId,
        p_attachment_ids: [attachmentId],
        p_order_ids: [orderId]
      });
      result = { attachmentIds: [options.responseAttachmentId || attachmentId], companyId, completionEventId: eventId, customerId, deliveryDate: "2026-11-09", completedAt: command.completedAt, noteId, orderIds: [orderId], orderRevisions: { [orderId]: 4 } };
    }
    if (result === undefined) throw new Error(`unexpected path: ${path}`);
    return result as T;
  });
}

describe("complete order delivery", () => {
  it("verifies the driver route, vehicle, stop, proof and maps post revisions", async () => {
    const result = await completeOrderDelivery(command, actor, repository());
    expect(result).toEqual({ completionEventId: eventId, completedAt: command.completedAt, orders: [{ orderId, orderRevision: 4 }] });
  });

  it("rejects an unconfirmed route or different vehicle before the RPC", async () => {
    await expect(completeOrderDelivery(command, actor, repository({ route: false }))).rejects.toThrow("확정된 오늘 코스");
    await expect(completeOrderDelivery(command, actor, repository({ vehicle: "2호차" }))).rejects.toThrow("배송 차량");
  });

  it("rejects cross-customer orders, cancelled orders and non-delivery proof", async () => {
    await expect(completeOrderDelivery(command, actor, repository({ customerId: "20000000-0000-4000-8000-000000000002" }))).rejects.toThrow("현재 정류장");
    await expect(completeOrderDelivery(command, actor, repository({ status: "cancelled" }))).rejects.toThrow("현재 정류장");
    await expect(completeOrderDelivery(command, actor, repository({ noteType: "general" }))).rejects.toThrow("배송 완료 메모");
  });

  it("requires the event id to be the idempotency key while SQL has no separate key", async () => {
    await expect(completeOrderDelivery({ ...command, idempotencyKey: "different" }, actor, repository())).rejects.toThrow("요청 범위");
  });

  it("passes an identical delivered retry to the SQL idempotency contract", async () => {
    await expect(completeOrderDelivery(command, actor, repository({ status: "delivered" }))).resolves.toMatchObject({ completionEventId: eventId });
  });

  it("rejects a result whose stored proof differs from the request", async () => {
    await expect(completeOrderDelivery(command, actor, repository({ responseAttachmentId: "60000000-0000-4000-8000-000000000002" }))).rejects.toThrow("증빙이 요청과 다릅니다");
  });
});
