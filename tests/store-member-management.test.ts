import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));

import { acceptStoreMemberInvitation, createStoreMemberInvitation, getPreparedStoreMemberInvitation, listStoreMembers, removeStoreMember } from "../lib/store/07-store-member-management";

describe("store member management", () => {
  beforeEach(() => mocks.db.mockReset());

  it("keeps raw invitation tokens out of RPC arguments", async () => {
    mocks.db.mockResolvedValue({});
    const token = await createStoreMemberInvitation({ actorMemberId: "actor", companyId: "company", role: "staff", storeAccountId: "store" });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const body = JSON.parse(mocks.db.mock.calls[0][1].body);
    expect(body.p_invite_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it("accepts and removes only through scoped RPC arguments", async () => {
    mocks.db.mockResolvedValue({});
    const token = "a".repeat(43);
    await acceptStoreMemberInvitation({ authUserId: "user", companyId: "company", storeAccountId: "store", token });
    await removeStoreMember({ actorMemberId: "actor", companyId: "company", storeAccountId: "store", targetMemberId: "target" });
    expect(mocks.db.mock.calls[0][0]).toBe("rpc/accept_store_member_invitation_v1");
    expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toEqual({ p_actor_member_id: "actor", p_company_id: "company", p_store_account_id: "store", p_target_member_id: "target" });
  });

  it("resolves an unexpired invitation only inside its active store", async () => {
    mocks.db.mockResolvedValue([{ company_id: "company", id: "member", role: "manager", store_account_id: "store" }]);
    expect(await getPreparedStoreMemberInvitation("b".repeat(43))).toEqual({ companyId: "company", memberId: "member", role: "manager", storeAccountId: "store" });
    expect(mocks.db.mock.calls[0][0]).toContain("status=eq.invited");
    expect(mocks.db.mock.calls[0][0]).toContain("store_accounts.business_status=in.(active,registration_pending)");
  });

  it("maps only display-safe roster fields", async () => {
    mocks.db.mockResolvedValue([{ app_users: { name: " 매장 직원 " }, auth_user_id: "private", id: "member",
      joined_at: "2026-11-08T00:00:00Z", role: "staff", status: "active" }]);
    await expect(listStoreMembers({ companyId: "company", storeAccountId: "store" })).resolves.toEqual([{
      id: "member", joinedAt: "2026-11-08T00:00:00Z", name: "매장 직원", role: "staff", status: "active"
    }]);
    expect(mocks.db.mock.calls[0][0]).toContain("company_id=eq.company&store_account_id=eq.store&status=in.(active,invited)");
  });
});
