import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ read: vi.fn(), db: vi.fn(), enabled: true }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/pricing/storefront", () => ({ readStorefront: mocks.read }));
vi.mock("@/lib/pricing/feature", () => ({
  priceSheetsEnabled: () => mocks.enabled,
}));
vi.mock("@/lib/pricing/store-order-feature", () => ({
  storeOrderingEnabled: () => mocks.enabled,
}));
vi.mock("@/lib/pricing/store-link-token", () => ({
  verifyStoreLinkToken: () => ({ hash: "a".repeat(64) }),
}));
vi.mock(
  "@/domains/pricing/document",
  () => import("../domains/pricing/document"),
);
vi.mock(
  "@/lib/pricing/storefront-public",
  () => import("../lib/pricing/storefront-public"),
);
import { PUT } from "../app/api/storefront/route";
const productId = "10000000-0000-4000-8000-000000000001";
const body = {
  token: "signed-link",
  deliveryDate: "2099-01-01",
  memo: "",
  lines: [{ productId, quantity: 1 }],
  idempotencyKey: "20000000-0000-4000-8000-000000000001",
};
function request(overrides = {}, origin = "https://store.example.test") {
  return new NextRequest("https://store.example.test/api/storefront", {
    method: "PUT",
    headers: { origin },
    body: JSON.stringify({ ...body, ...overrides }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
});
it("keeps order submission dormant before any link or DB read", async () => {
  mocks.enabled = false;
  expect((await PUT(request())).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});
it("rejects signed links whose company is no longer eligible before order RPC", async () => {
  mocks.read.mockResolvedValue(null);
  expect((await PUT(request({ companyId: "caller-company" }))).status).toBe(
    404,
  );
  expect(mocks.read).toHaveBeenCalledWith(body.token, body.deliveryDate);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("takes order scope and prices only from the verified token RPC", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company" });
  mocks.db.mockResolvedValue({ id: "saved" });
  expect(
    (await PUT(request({ companyId: "forged-company", knownTotal: 1 }))).status,
  ).toBe(200);
  const payload = JSON.parse(mocks.db.mock.calls[0][1].body);
  expect(payload.p_token_hash).toBe("a".repeat(64));
  expect(payload).not.toHaveProperty("companyId");
  expect(payload).not.toHaveProperty("knownTotal");
});
it("rejects cross-origin writes before resolving a link", async () => {
  expect((await PUT(request({}, "https://other.example.test"))).status).toBe(
    403,
  );
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});
