import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ read: vi.fn(), member: vi.fn(), db: vi.fn(), enabled: true, memberEnabled: true, memberCompany: true }));
vi.mock("@/lib/pricing/store-order-member", () => ({ getStoreOrderActor: mocks.member }));
vi.mock("@/lib/auth", () => ({ storeMemberSessionEnabled: () => mocks.memberEnabled }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: () => mocks.memberCompany }));
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
  mocks.memberEnabled = true;
  mocks.memberCompany = true;
  mocks.member.mockResolvedValue(null);
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
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  mocks.db.mockResolvedValue({ id: "saved" });
  expect(
    (await PUT(request({ companyId: "forged-company", knownTotal: 1,
      lines: [{ productId, quantity: 1, unitPrice: 1, taxType: "exempt", companyId: "forged-company", cost: 7 }] }))).status,
  ).toBe(200);
  const payload = JSON.parse(mocks.db.mock.calls[0][1].body);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_member_order");
  expect(payload.p_token_hash).toBe("a".repeat(64));
  expect(mocks.member).toHaveBeenCalledWith({ companyId: "verified-company", customerId: "verified-customer" });
  expect(payload.p_store_account_id).toBe("verified-store");
  expect(payload.p_member_id).toBe("verified-member");
  expect(payload.p_auth_user_id).toBe("verified-user");
  expect(payload).not.toHaveProperty("companyId");
  expect(payload).not.toHaveProperty("knownTotal");
  expect(payload.p_lines).toEqual([{ productId, quantity: 1 }]);
});
it("keeps the existing token order RPC for companies without member ordering", async () => {
  mocks.memberCompany = false;
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  mocks.db.mockResolvedValue({ id: "saved" });
  expect((await PUT(request({ memberOrdering: true, memberId: "forged", authUserId: "forged" }))).status).toBe(200);
  expect(mocks.member).not.toHaveBeenCalled();
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_order");
  const payload = JSON.parse(mocks.db.mock.calls[0][1].body);
  expect(payload).not.toHaveProperty("p_member_id");
  expect(payload).not.toHaveProperty("p_auth_user_id");
  expect(payload).not.toHaveProperty("p_store_account_id");
});
it("keeps the existing token order RPC while the member session flag is off", async () => {
  mocks.memberEnabled = false;
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  mocks.db.mockResolvedValue({ id: "saved" });
  expect((await PUT(request())).status).toBe(200);
  expect(mocks.member).not.toHaveBeenCalled();
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_order");
});
it("rejects a public token alone and ignores caller-supplied member scope before writing", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  const response = await PUT(request({ companyId: "forged", customerId: "forged", storeAccountId: "forged", memberId: "forged" }));
  expect(response.status).toBe(403);
  expect(mocks.member).toHaveBeenCalledWith({ companyId: "verified-company", customerId: "verified-customer" });
  expect(mocks.db).not.toHaveBeenCalled();
});
it("reports a membership revocation that races with the order transaction", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  mocks.db.mockRejectedValue(new Error("Store member unavailable"));
  const response = await PUT(request());
  expect(response.status).toBe(403);
  expect((await response.json()).message).toContain("다시 로그인");
  expect(mocks.db).toHaveBeenCalledTimes(1);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_member_order");
});
it("never falls back to token-only ordering when the member RPC is unavailable", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  mocks.db.mockRejectedValue(new Error("RPC unavailable"));
  expect((await PUT(request())).status).toBe(409);
  expect(mocks.db).toHaveBeenCalledTimes(1);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_member_order");
});
it("rejects cross-origin writes before resolving a link", async () => {
  expect((await PUT(request({}, "https://other.example.test"))).status).toBe(
    403,
  );
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});
