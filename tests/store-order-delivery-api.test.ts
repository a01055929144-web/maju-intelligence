import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parseStoreOrderDeliverySnapshot } from "../domains/order/store-order-delivery-snapshot";
import { storeOrderDeliverySnapshotEnabled } from "../lib/pricing/store-order-delivery-feature";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { POST } from "../app/api/store-orders/delivery-completion/route";

const snapshot = { deliveryCustomerNameSnapshot: " 합성 매장 ", deliveryAddressSnapshot: " 합성 주소 ",
  deliveryAddressDetailSnapshot: "", deliveryRecipientPhoneSnapshot: null, deliveryLoadingPositionSnapshot: " 앞 " };
const request = (origin = "https://store.example.test") => new NextRequest("https://store.example.test/api/store-orders/delivery-completion", {
  method: "POST", headers: { origin }, body: JSON.stringify({ companyId: "forged", actorKey: "forged", driverVerified: true, proofVerified: true }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPLETION_ENABLED", "");
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "");
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", "");
  mocks.auth.mockResolvedValue({ ok: true, companyId: "session-company" });
});
afterEach(() => vi.unstubAllEnvs());

it("requires an explicit snapshot flag and exact nonempty company allowlist", () => {
  expect(storeOrderDeliverySnapshotEnabled("company")).toBe(false);
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true");
  expect(storeOrderDeliverySnapshotEnabled("")).toBe(false);
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", " other, company ");
  expect(storeOrderDeliverySnapshotEnabled("company")).toBe(true);
  expect(storeOrderDeliverySnapshotEnabled("caller-company")).toBe(false);
});
it("normalizes the five SQL snapshot fields without caller scope or extra fields", () => {
  expect(parseStoreOrderDeliverySnapshot(snapshot)).toEqual({
    deliveryCustomerNameSnapshot: "합성 매장", deliveryAddressSnapshot: "합성 주소",
    deliveryAddressDetailSnapshot: null, deliveryRecipientPhoneSnapshot: null, deliveryLoadingPositionSnapshot: "앞",
  });
  for (const bad of [null, [], {}, { ...snapshot, companyId: "forged" }, { ...snapshot, deliveryRecipientPhoneSnapshot: 123 },
    { ...snapshot, deliveryAddressSnapshot: " " }, { ...snapshot, deliveryAddressSnapshot: "가".repeat(501) }]) {
    expect(() => parseStoreOrderDeliverySnapshot(bad)).toThrow(/delivery_snapshot_/);
  }
});
it("blocks OFF completion before session, body reads or database access", async () => {
  const input = request();
  const json = vi.spyOn(input, "json");
  expect((await POST(input)).status).toBe(404);
  expect(json).not.toHaveBeenCalled();
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});
it("does not treat a staff session or forged client verification as a verified driver/route/proof", async () => {
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPLETION_ENABLED", "true");
  const input = request();
  const json = vi.spyOn(input, "json");
  const response = await POST(input);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("delivery_completion_verification_unavailable");
  expect(mocks.auth).toHaveBeenCalledWith(input);
  expect(json).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});
it("blocks cross-origin and unauthenticated completion without calling SQL", async () => {
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPLETION_ENABLED", "true");
  expect((await POST(request("https://other.example.test"))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ ok: false });
  expect((await POST(request())).status).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});
