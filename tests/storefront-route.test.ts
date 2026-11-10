import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/pricing/store-order-delivery-feature", () => import("../lib/pricing/store-order-delivery-feature"));
vi.mock("@/lib/pricing/store-order-delivery-producer", () => import("../lib/pricing/store-order-delivery-producer"));
const mocks = vi.hoisted(() => ({ read: vi.fn(), member: vi.fn(), orderContext: vi.fn(), db: vi.fn(), enabled: true, memberEnabled: true, memberCompany: true }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: mocks.orderContext }));
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
import { POST, PUT } from "../app/api/storefront/route";
afterEach(() => vi.unstubAllEnvs());
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
  mocks.orderContext.mockResolvedValue(null);
});
it("accepts a verified member's pending delivery without inventing a date", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer", pendingDelivery: true, canOrder: true });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  mocks.db.mockResolvedValue({ id: "pending", deliveryConfirmation: "pending" });
  expect((await PUT(request({ deliveryDate: null }))).status).toBe(200);
  expect(mocks.db.mock.calls[0][0]).toBe("rpc/place_store_pending_delivery_order");
  expect(JSON.parse(mocks.db.mock.calls[0][1].body).p_delivery_date).toBeNull();
});
it("rejects pending mode spoofing and stale schedule changes", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer" });
  expect((await PUT(request({ deliveryDate: null, pendingDelivery: true }))).status).toBe(409);
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer", pendingDelivery: true });
  expect((await PUT(request())).status).toBe(409);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("keeps needs_review or other disabled order links blocked for pending intake", async () => {
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer", pendingDelivery: true, canOrder: false });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  expect((await PUT(request({ deliveryDate: null }))).status).toBe(409);
  expect(mocks.db).not.toHaveBeenCalled();
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

it("returns the 02 delivery DTO from the existing PUT while retaining the result object", async () => {
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true");
  vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", "verified-company");
  mocks.read.mockResolvedValue({ companyId: "verified-company", customerId: "verified-customer", linkId: "verified-link",
    customerName: "합성 매장", deliveryAddress: "합성 주소" });
  mocks.member.mockResolvedValue({ storeAccountId: "verified-store", memberId: "verified-member", authUserId: "verified-user" });
  const saved = { id: productId, revision: 1, knownTotal: 1200, marketPricePending: false };
  mocks.db.mockResolvedValueOnce([]).mockResolvedValueOnce(saved);
  const response = await PUT(request({ companyId: "forged", customerId: "forged" }));
  expect(await response.json()).toEqual({ result: saved, delivery: {
    companyId: "verified-company", customerId: "verified-customer", orderId: productId, orderRevision: 1,
    deliveryDate: body.deliveryDate, destination: { customerName: "합성 매장", address: "합성 주소" },
  } });
  expect(mocks.db.mock.calls[1][0]).toBe("rpc/place_store_order_with_delivery_snapshot_09");
  expect(JSON.parse(mocks.db.mock.calls[1][1].body).p_member_id).toBe("verified-member");
});

const viewScope = { companyId: "00000000-0000-4000-8000-000000000001", customerId: "20000000-0000-4000-8000-000000000001" };
const viewMember = { ...viewScope, status: "active", role: "owner", storeAccountId: "30000000-0000-4000-8000-000000000001", memberId: "40000000-0000-4000-8000-000000000001", authUserId: "50000000-0000-4000-8000-000000000001" };
async function view() {
  mocks.read.mockResolvedValue({ ...viewScope, priceAvailable: false, lines: [], policy: { weekdays: [], holidays: [] } });
  mocks.db.mockResolvedValue([]);
  return POST(new NextRequest("https://store.example.test/api/storefront", {
    method: "POST", headers: { origin: "https://store.example.test" },
    body: JSON.stringify({ token: "signed", companyId: "forged", customerId: "forged", role: "owner" }),
  }));
}
it.each(["owner", "manager"])("returns a verified same-store management link only for %s", async role => {
  mocks.orderContext.mockResolvedValue({ ...viewMember, role });
  const response = await view();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.memberManagement).toEqual({ href: `/store/members?companyId=${viewScope.companyId}&storeAccountId=${viewMember.storeAccountId}` });
  expect(mocks.orderContext).toHaveBeenCalledExactlyOnceWith(viewScope);
  expect(JSON.stringify(result)).not.toMatch(/authUserId|memberId|p_auth_user_id/);
});
it.each([null, { ...viewMember, role: "staff" }, { ...viewMember, companyId: "other" }, { ...viewMember, customerId: "other" }, { ...viewMember, status: "removed" }])("withholds management entry for unauthorized context %#", async context => {
  mocks.orderContext.mockResolvedValue(context);
  const response = await view();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.memberManagement).toEqual({ message: expect.stringContaining("점주·관리자로 로그인") });
  expect(result.memberManagement).not.toHaveProperty("href");
});
it.each(["memberEnabled", "memberCompany"] as const)("leaves management dormant with no auth lookup when %s is OFF", async flag => {
  mocks[flag] = false;
  const response = await view();
  expect(response.status).toBe(200);
  expect((await response.json()).memberManagement).toBeUndefined();
  expect(mocks.orderContext).not.toHaveBeenCalled();
});
it("keeps public viewing readable and withholds the entry on a membership lookup failure", async () => {
  mocks.orderContext.mockRejectedValue(new Error("private lookup failure"));
  const response = await view();
  expect(response.status).toBe(200);
  expect((await response.json()).memberManagement).toEqual({ message: expect.stringContaining("다시 확인") });
});

async function historyRead() {
  mocks.read.mockResolvedValue({ ...viewScope, priceAvailable: true, lines: [], policy: { weekdays: [], holidays: [] } });
  return POST(new NextRequest("https://store.example.test/api/storefront", { method: "POST", headers: { origin: "https://store.example.test" }, body: JSON.stringify({ token: "signed", companyId: "forged", storeAccountId: "forged", memberId: "forged" }) }));
}
it.each(["owner", "manager", "staff"])("shows stored authors only to a verified same-store %s", async role => {
  mocks.orderContext.mockResolvedValue({ ...viewMember, role });
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("store_orders?")) return [
      { id: "order", store_account_id: viewMember.storeAccountId, ordered_by_member_id: viewMember.memberId },
      { id: "legacy", store_account_id: null, ordered_by_member_id: null },
      { id: "other", store_account_id: "other-store", ordered_by_member_id: viewMember.authUserId },
      { id: "missing", store_account_id: viewMember.storeAccountId, ordered_by_member_id: viewScope.customerId },
    ];
    if (path.startsWith("store_account_members?")) return [{ id: viewMember.memberId, role: "owner", app_users: { name: "합성 원작성자" } }];
    return [];
  });
  const response = await historyRead(); expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.orders.map((order: { authorLabel: string }) => order.authorLabel)).toEqual(["합성 원작성자 · 점주", "기존 링크 주문", "작성자 확인 필요", "작성자 확인 필요"]);
  expect(result.memberLogin).toBeUndefined();
  const query = mocks.db.mock.calls.find(([path]) => path.startsWith("store_account_members?"))![0];
  expect(query).toContain(`company_id=eq.${viewScope.companyId}`); expect(query).toContain(`store_account_id=eq.${viewMember.storeAccountId}`);
  expect(query).not.toContain(viewMember.authUserId);
  expect(JSON.stringify(result)).not.toMatch(/ordered_by_member_id|store_account_id|authUserId|memberId/);
});
it("offers only a server-resolved login scope to an anonymous bearer and never reads author names", async () => {
  mocks.orderContext.mockResolvedValue(null);
  mocks.db.mockImplementation(async (path: string) => path.startsWith("store_accounts?") ? [{ id: viewMember.storeAccountId }] : path.startsWith("store_orders?") ? [{ id: "order", ordered_by_member_id: viewMember.memberId }] : []);
  const response = await historyRead(); const result = await response.json();
  expect(result.memberLogin).toEqual({ enabled: true, companyId: viewScope.companyId, storeAccountId: viewMember.storeAccountId });
  expect(result.orders[0]).not.toHaveProperty("authorLabel");
  expect(mocks.db.mock.calls.some(([path]) => path.startsWith("store_account_members?"))).toBe(false);
  expect(mocks.db.mock.calls.find(([path]) => path.startsWith("store_accounts?"))![0]).toContain(`customer_id=eq.${viewScope.customerId}`);
});
it.each(["memberEnabled", "memberCompany"] as const)("adds no member login or history name lookup with %s OFF", async flag => {
  mocks[flag] = false; mocks.db.mockResolvedValue([]);
  const result = await (await historyRead()).json(); expect(result.memberLogin).toBeUndefined();
  expect(mocks.orderContext).not.toHaveBeenCalled();
  expect(mocks.db.mock.calls.some(([path]) => /^(store_accounts|store_account_members)\?/.test(path))).toBe(false);
  expect(mocks.db.mock.calls.find(([path]) => path.startsWith("store_orders?"))![0]).not.toContain("ordered_by_member_id");
});
