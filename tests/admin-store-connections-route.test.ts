import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), feature: vi.fn() }));
vi.mock("../lib/auth", () => ({ requireAdminSession: mocks.admin }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/store/07-store-owner-provisioning", () => ({ getStorePublicBaseUrl: () => "https://maju.test" }));
import { GET, POST } from "../app/api/admin/store-connections/route";

const c1 = "00000000-0000-4000-8000-000000000001", a1 = "10000000-0000-4000-8000-000000000001", m1 = "20000000-0000-4000-8000-000000000001", k1 = "30000000-0000-4000-8000-000000000001";
const adminKey = createHash("sha256").update("maju-admin:ops@example.test").digest("hex");
const post = (body: unknown, origin = "https://app.test") => new NextRequest("https://app.test/api/admin/store-connections", { method: "POST", headers: { origin, host: "app.test", "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (qs: string) => new NextRequest(`https://app.test/api/admin/store-connections?${qs}`);
const rpcBody = (index = 0) => JSON.parse(String(mocks.db.mock.calls.filter(call => String(call[0]).startsWith("rpc/"))[index][1].body));

beforeEach(() => {
  vi.clearAllMocks(); mocks.admin.mockResolvedValue({ email: "Ops@Example.test", name: "운영" }); mocks.feature.mockReturnValue(true);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("store_accounts?")) return [{ id: a1, status: "active", customer_id: k1 }];
    if (path.startsWith("store_account_members?")) return [{ id: m1, role: "owner", status: "active", joined_at: "2026-11-01T00:00:00Z", app_users: { name: "점주", phone: "010" } }];
    if (path.startsWith("rpc/admin_prepare_store_owner_activation_v1")) return { expiresAt: "2026-11-25T00:30:00Z" };
    return {};
  });
});

describe("CX-144 U0 admin store connections", () => {
  it("is MAJU-admin only and hidden unless the company is allowlisted", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await GET(get(`companyId=${c1}&storeAccountId=${a1}`))).status).toBe(401);
    expect((await POST(post({ action: "close", companyId: c1, storeAccountId: a1 }))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
    mocks.admin.mockResolvedValue({ email: "ops@example.test", name: "운영" }); mocks.feature.mockReturnValue(false);
    expect((await GET(get(`companyId=${c1}&storeAccountId=${a1}`))).status).toBe(404);
    expect((await POST(post({ action: "close", companyId: c1, storeAccountId: a1 }))).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("lists the store's members for the given company only", async () => {
    const body = await (await GET(get(`companyId=${c1}&storeAccountId=${a1}`))).json();
    expect(body).toMatchObject({ storeAccountId: a1, status: "active", members: [{ id: m1, role: "owner", name: "점주" }] });
    for (const call of mocks.db.mock.calls) expect(String(call[0])).toContain(`company_id=eq.${c1}`);
  });
  it("close / remove_member call the admin function with a hashed admin key, never a customer-supplied actor", async () => {
    expect((await POST(post({ action: "close", companyId: c1, storeAccountId: a1, adminKey: "x".repeat(64) }))).status).toBe(200);
    expect(rpcBody()).toEqual({ p_company_id: c1, p_store_account_id: a1, p_admin_key: adminKey, p_action: "close" });
    mocks.db.mockClear();
    expect((await POST(post({ action: "remove_member", companyId: c1, storeAccountId: a1, memberId: m1 }))).status).toBe(200);
    expect(rpcBody()).toEqual({ p_company_id: c1, p_store_account_id: a1, p_member_id: m1, p_admin_key: adminKey, p_action: "remove_member" });
    expect((await POST(post({ action: "remove_member", companyId: c1, storeAccountId: a1 }))).status).toBe(400);
  });
  it("add_owner invites only the store account's own customer and returns the activation link", async () => {
    const response = await POST(post({ action: "add_owner", companyId: c1, storeAccountId: a1, customerId: "40000000-0000-4000-8000-000000000009" }));
    const body = await response.json();
    expect(response.status).toBe(200); expect(body.activationUrl).toMatch(/^https:\/\/maju\.test\/store\/activate#[A-Za-z0-9_-]{43}$/);
    const rpc = rpcBody();
    expect(rpc).toMatchObject({ p_company_id: c1, p_customer_id: k1, p_admin_key: adminKey });
    expect(rpc.p_invite_token_hash).toBe(createHash("sha256").update(body.activationUrl.split("#")[1]).digest("hex"));
  });
  it("rejects cross-origin posts, unknown actions, and maps DB refusals to clear Korean messages", async () => {
    expect((await POST(post({ action: "close", companyId: c1, storeAccountId: a1 }, "https://evil.test"))).status).toBe(403);
    expect((await POST(post({ action: "delete", companyId: c1, storeAccountId: a1 }))).status).toBe(400);
    mocks.db.mockRejectedValueOnce(new Error("store_connection_unavailable"));
    expect((await POST(post({ action: "close", companyId: c1, storeAccountId: a1 }))).status).toBe(409);
    mocks.db.mockImplementation(async (path: string) => { if (path.startsWith("store_accounts?")) return [{ id: a1, status: "closed", customer_id: k1 }]; throw new Error("store_account_exists"); });
    expect((await POST(post({ action: "add_owner", companyId: c1, storeAccountId: a1 }))).status).toBe(409);
  });
});

describe("CX-144 U0b force link", () => {
  const u1 = "50000000-0000-4000-8000-000000000001";
  it("searches only kakao-logged-in active users, by name and/or last 4 digits, and masks phone numbers", async () => {
    mocks.db.mockImplementation(async () => [{ id: u1, name: "홍길동", phone: "01012341234", last_login_at: "2026-11-24T00:00:00Z" }]);
    const body = await (await GET(get(`companyId=${c1}&q=${encodeURIComponent("홍길동 1234")}`))).json();
    expect(body.users).toEqual([{ id: u1, name: "홍길동", phoneMasked: "010-****-1234", lastLoginAt: "2026-11-24T00:00:00Z" }]);
    const path = String(mocks.db.mock.calls[0][0]);
    expect(path).toContain("kakao_user_id=not.is.null"); expect(path).toContain("status=eq.active");
    expect(path).toContain(`name=ilike.*${encodeURIComponent("홍길동")}*`); expect(path).toContain("phone=like.*1234");
    expect(JSON.stringify(body)).not.toContain("01012341234");
    mocks.db.mockClear();
    expect((await (await GET(get(`companyId=${c1}&q=${encodeURIComponent("홍")}`))).json()).users).toEqual([]);
    expect(mocks.db).not.toHaveBeenCalled();
    mocks.feature.mockReturnValue(false);
    expect((await GET(get(`companyId=${c1}&q=abcd`))).status).toBe(404);
  });
  it("requires a reason and passes the admin key, role and replace flag only when explicit", async () => {
    const base = { action: "link_member", companyId: c1, storeAccountId: a1, userId: u1, role: "owner" };
    expect((await POST(post({ ...base, reason: " " }))).status).toBe(400);
    expect((await POST(post({ ...base, reason: "x" }))).status).toBe(400);
    expect((await POST(post({ ...base, role: "admin", reason: "권한 상승 시도" }))).status).toBe(400);
    expect((await POST(post({ ...base, userId: "nope", reason: "잘못된 사용자" }))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
    expect((await POST(post({ ...base, reason: "점주 요청 확인 후 연결" }))).status).toBe(200);
    expect(rpcBody()).toEqual({ p_company_id: c1, p_store_account_id: a1, p_admin_key: adminKey, p_auth_user_id: u1, p_role: "owner", p_reason: "점주 요청 확인 후 연결", p_replace_owner: false });
    mocks.db.mockClear();
    await POST(post({ ...base, reason: "점주 교체 요청", replaceOwner: true }));
    expect(rpcBody().p_replace_owner).toBe(true);
  });
  it("is admin-only and maps refusals (existing owner, non-kakao user, duplicate) to clear messages", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await GET(get(`companyId=${c1}&q=홍길동`))).status).toBe(401);
    expect((await POST(post({ action: "link_member", companyId: c1, storeAccountId: a1, userId: u1, role: "staff", reason: "시험 연결" }))).status).toBe(401);
    mocks.admin.mockResolvedValue({ email: "ops@example.test", name: "운영" });
    for (const [error, status] of [["active_store_owner_exists", 409], ["store_link_user_unavailable", 409], ["active_store_member_exists", 409], ["store_connection_unavailable", 409]] as const) {
      mocks.db.mockRejectedValueOnce(new Error(error));
      expect((await POST(post({ action: "link_member", companyId: c1, storeAccountId: a1, userId: u1, role: "owner", reason: "시험 연결" }))).status).toBe(status);
    }
  });
});
