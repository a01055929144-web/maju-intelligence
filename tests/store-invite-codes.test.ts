import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), manage: vi.fn(() => true), supabase: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: mocks.manage }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.supabase }));
import { GET, POST } from "../app/api/store-invite-codes/route";
import { formatInviteCode, inviteCodeFromBytes, inviteCodeStatus, normalizeInviteCode } from "../domains/store/invite-code";

const companyId = "00000000-0000-4000-8000-000000000001";
const codeId = "00000000-0000-4000-8000-0000000000c1";
const owner = { ok: true, companyId, customerSession: { role: "owner", workspaceRole: "owner", userId: "u1" } };
const post = (body: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/store-invite-codes", { method: "POST", body: JSON.stringify(body) }));

describe("store invite code rules", () => {
  it("makes unambiguous 8-char codes, normalizes input and reports status", () => {
    const code = inviteCodeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 255, 7]))!;
    expect(code).toBe("23456789"); // 255은 편향 방지로 버린다
    expect(normalizeInviteCode(" 2345-6789 ")).toBe("23456789");
    expect(normalizeInviteCode("2345678O")).toBeNull(); // O(오)는 쓰지 않는다
    expect(normalizeInviteCode("2345")).toBeNull();
    expect(formatInviteCode("ABCDEFGH")).toBe("ABCD-EFGH");
    expect(inviteCodeStatus({ expiresAt: "2026-01-01T00:00:00Z", revokedAt: null }, Date.parse("2026-02-01"))).toBe("expired");
    expect(inviteCodeStatus({ expiresAt: "2099-01-01T00:00:00Z", revokedAt: "2026-01-01" })).toBe("revoked");
  });
});

describe("store invite code API (CC-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.supabase.mockReset(); mocks.manage.mockReturnValue(true); mocks.auth.mockResolvedValue(owner);
    process.env.STORE_DIRECT_SIGNUP_ENABLED = "true"; process.env.STORE_LINK_SECRET = "s".repeat(32);
  });

  it("is hidden while direct signup is off", async () => {
    process.env.STORE_DIRECT_SIGNUP_ENABLED = "";
    expect((await GET(new NextRequest("http://localhost/api/store-invite-codes"))).status).toBe(404);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("issues a code shown once and stores only its keyed hash for this company", async () => {
    mocks.supabase.mockResolvedValueOnce(codeId);
    const response = await post({ action: "issue", expiresInDays: 30 });
    expect(response.status).toBe(200);
    const { code } = await response.json();
    expect(normalizeInviteCode(code)).toBe(code);
    const sent = JSON.parse(mocks.supabase.mock.calls[0][1].body);
    expect(sent.p_company_id).toBe(companyId);
    expect(sent.p_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sent)).not.toContain(code);
  });

  it("rejects unsupported expiry and staff without the owner/manager role", async () => {
    expect((await post({ action: "issue", expiresInDays: 5 })).status).toBe(400);
    mocks.manage.mockReturnValue(false);
    expect((await post({ action: "issue", expiresInDays: 30 })).status).toBe(403);
    expect((await GET(new NextRequest("http://localhost/api/store-invite-codes"))).status).toBe(403);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("does not let a MAJU admin preview issue codes", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: null, adminSession: { id: "a" } });
    expect((await post({ action: "issue", expiresInDays: 30 })).status).toBe(403);
  });

  it("revokes only within the signed-in company and lists usage counts", async () => {
    mocks.supabase.mockResolvedValueOnce(true);
    expect((await post({ action: "revoke", id: codeId })).status).toBe(200);
    expect(JSON.parse(mocks.supabase.mock.calls[0][1].body)).toEqual({ p_company_id: companyId, p_code_id: codeId });
    mocks.supabase.mockReset()
      .mockResolvedValueOnce([{ id: codeId, created_at: "2026-11-11T00:00:00Z", expires_at: "2026-12-11T00:00:00Z", revoked_at: null }])
      .mockResolvedValueOnce([{ invite_code_id: codeId }, { invite_code_id: codeId }]);
    const list = await (await GET(new NextRequest("http://localhost/api/store-invite-codes"))).json();
    expect(list.items[0]).toMatchObject({ id: codeId, storeCount: 2 });
    for (const [path] of mocks.supabase.mock.calls) expect(path).toContain(`company_id=eq.${companyId}`);
  });
});
