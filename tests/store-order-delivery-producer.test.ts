import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/store", () => ({ supabaseRequest: vi.fn() }));
import { placeStoreOrderWithDelivery } from "../lib/pricing/store-order-delivery-producer";

const scope = { companyId: "company-a", customerId: "customer-a", linkId: "link-a", customerName: " 매장 ", deliveryAddress: " 주소 " };
const orderId = "10000000-0000-4000-8000-000000000001";
const payload = { p_idempotency_key: "20000000-0000-4000-8000-000000000001", p_delivery_date: "2099-01-05", p_order_id: null };
const saved = { id: orderId, revision: 1, knownTotal: 1200, marketPricePending: false };
const row = { delivery_customer_name_snapshot: "원 매장", delivery_address_snapshot: "원 주소",
  delivery_address_detail_snapshot: null, delivery_recipient_phone_snapshot: null, delivery_loading_position_snapshot: "후문" };
beforeEach(() => {
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true");
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", scope.companyId);
});
afterEach(() => vi.unstubAllEnvs());
it("blocks disabled or unlisted companies before any schema access", async () => {
  const request = vi.fn();
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "");
  await expect(placeStoreOrderWithDelivery({ scope, payload }, request)).rejects.toThrow("disabled");
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true");
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", "other-company");
  await expect(placeStoreOrderWithDelivery({ scope, payload }, request)).rejects.toThrow("disabled");
  expect(request).not.toHaveBeenCalled();
});
it("creates the DTO from the server scope and SQL acknowledgement", async () => {
  const request = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(saved);
  expect(await placeStoreOrderWithDelivery({ scope, payload }, request)).toEqual({ result: saved,
    delivery: { companyId: scope.companyId, customerId: scope.customerId, orderId, orderRevision: 1,
      deliveryDate: payload.p_delivery_date, destination: { customerName: "매장", address: "주소" } } });
  expect(JSON.parse(request.mock.calls[1][1].body).p_snapshot.deliveryAddressSnapshot).toBe("주소");
});
it("keeps the original snapshot on retry after a master address change", async () => {
  const request = vi.fn().mockResolvedValueOnce([{ order_id: orderId }]).mockResolvedValueOnce([row]).mockResolvedValueOnce(saved);
  const result = await placeStoreOrderWithDelivery({ scope: { ...scope, deliveryAddress: "새 주소" }, payload }, request);
  expect(result.delivery.destination).toEqual({ customerName: "원 매장", address: "원 주소", loadingPosition: "후문" });
  expect(request.mock.calls[0][0]).toContain("company_id=eq.company-a&link_id=eq.link-a");
  expect(request.mock.calls[1][0]).toContain("company_id=eq.company-a&customer_id=eq.customer-a");
});
it("uses the persisted immutable snapshot for edits without backfilling legacy orders", async () => {
  const request = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce({ ...saved, revision: 2 });
  expect((await placeStoreOrderWithDelivery({ scope, payload: { ...payload, p_order_id: orderId } }, request)).delivery.orderRevision).toBe(2);
  const missing = vi.fn().mockResolvedValue([{ ...row, delivery_address_snapshot: null }]);
  await expect(placeStoreOrderWithDelivery({ scope, payload: { ...payload, p_order_id: orderId } }, missing)).rejects.toThrow("required");
  expect(missing).toHaveBeenCalledTimes(1);
});
it("does not replace explicit caller changes with cached proof or fall back after SQL conflict", async () => {
  const request = vi.fn().mockRejectedValue(new Error("delivery_snapshot_idempotency_conflict"));
  await expect(placeStoreOrderWithDelivery({ scope, payload, snapshot: {
    deliveryCustomerNameSnapshot: "매장", deliveryAddressSnapshot: "변경 주소" } }, request)).rejects.toThrow("conflict");
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe("rpc/place_store_order_with_delivery_snapshot_09");
});
it("rejects malformed or caller-scoped snapshots without any database request", async () => {
  const request = vi.fn();
  for (const snapshot of [null, [], {}, { deliveryCustomerNameSnapshot: "매장", deliveryAddressSnapshot: "주소", companyId: "forged" },
    { deliveryCustomerNameSnapshot: "매장", deliveryAddressSnapshot: "가".repeat(501) }]) {
    await expect(placeStoreOrderWithDelivery({ scope, payload, snapshot }, request)).rejects.toThrow(/delivery_snapshot_/);
  }
  expect(request).not.toHaveBeenCalled();
});
