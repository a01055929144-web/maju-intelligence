import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAccessStoreCosts } from "../domains/organization/store-cost-access";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { getStoreCostMemberAccess, hasActiveStoreMembership, resolveStoreAuthUserId } from "../lib/store/08-store-cost-access";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const authUserId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => vi.clearAllMocks());

describe("store cost membership boundary", () => {
  it("checks the authenticated Kakao user inside the company and store-account pair", async () => {
    mocks.db
      .mockResolvedValueOnce([{ id: authUserId }])
      .mockResolvedValueOnce([{ id: "member-1", role: "owner", status: "active", private_value: "not returned" }]);

    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toEqual({
      id: "member-1", role: "owner", status: "active"
    });
    expect(mocks.db).toHaveBeenNthCalledWith(1,
      `app_users?select=id&id=eq.${authUserId}&status=eq.active&limit=1`
    );
    expect(mocks.db).toHaveBeenNthCalledWith(2,
      `store_account_members?select=id,role,status,store_accounts!inner(id)&company_id=eq.${companyId}&store_account_id=eq.${storeAccountId}&auth_user_id=eq.${authUserId}&status=eq.active&store_accounts.status=eq.active&store_accounts.business_status=eq.active&limit=1`
    );
  });

  it("rejects token-only, missing-user and malformed identifiers before database access", async () => {
    await expect(getStoreCostMemberAccess({ companyId, storeAccountId } as never)).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId: "public-link-token", companyId, storeAccountId })).resolves.toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("rejects inactive, unknown-role and cross-company or cross-store lookups", async () => {
    mocks.db
      .mockResolvedValueOnce([{ id: authUserId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: authUserId }])
      .mockResolvedValueOnce([{ id: "member-1", role: "owner", status: "removed" }])
      .mockResolvedValueOnce([{ id: authUserId }])
      .mockResolvedValueOnce([{ id: "member-1", role: "administrator", status: "active" }]);

    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
  });

  it("requires an active parent account, active business and active auth user on every request", async () => {
    mocks.db.mockResolvedValueOnce([{ id: authUserId }]).mockResolvedValueOnce([]);
    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
    expect(mocks.db.mock.calls[0]?.[0]).toBe(`app_users?select=id&id=eq.${authUserId}&status=eq.active&limit=1`);
    expect(mocks.db.mock.calls[1]?.[0]).toContain("store_accounts.status=eq.active");
    expect(mocks.db.mock.calls[1]?.[0]).toContain("store_accounts.business_status=eq.active");
    expect(mocks.db.mock.calls[1]?.[0]).not.toContain("app_users!inner");
  });
});

describe("store cost role permissions", () => {
  it.each(["owner", "manager"] as const)("allows %s to read and manage", role => {
    expect(canAccessStoreCosts(role, "read")).toBe(true);
    expect(canAccessStoreCosts(role, "manage")).toBe(true);
  });

  it("allows staff to read but not upload or correct costs", () => {
    expect(canAccessStoreCosts("staff", "read")).toBe(true);
    expect(canAccessStoreCosts("staff", "manage")).toBe(false);
  });
});

describe("store Kakao identity resolution", () => {
  it("resolves only an active existing app user", async () => {
    mocks.db.mockResolvedValue([{ id: authUserId }]);
    await expect(resolveStoreAuthUserId("123456789")).resolves.toBe(authUserId);
    expect(mocks.db).toHaveBeenCalledWith("app_users?select=id&kakao_user_id=eq.123456789&status=eq.active&limit=1");
  });

  it("does not create a user or accept a public token as Kakao identity", async () => {
    await expect(resolveStoreAuthUserId("public-link-token")).resolves.toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("issues a session only when the internal user has an active store membership", async () => {
    mocks.db
      .mockResolvedValueOnce([{ id: authUserId }]).mockResolvedValueOnce([{ id: "member-1" }])
      .mockResolvedValueOnce([{ id: authUserId }]).mockResolvedValueOnce([]);
    await expect(hasActiveStoreMembership(authUserId)).resolves.toBe(true);
    await expect(hasActiveStoreMembership(authUserId)).resolves.toBe(false);
    expect(mocks.db).toHaveBeenNthCalledWith(2,
      `store_account_members?select=id,store_accounts!inner(id)&auth_user_id=eq.${authUserId}&status=eq.active&store_accounts.status=eq.active&store_accounts.business_status=eq.active&limit=1`);
  });

  it("rejects login when every membership belongs to a suspended, closed or inactive account", async () => {
    mocks.db.mockResolvedValueOnce([{ id: authUserId }]).mockResolvedValueOnce([]);
    await expect(hasActiveStoreMembership(authUserId)).resolves.toBe(false);
    expect(mocks.db.mock.calls[1]?.[0]).toContain("store_accounts.status=eq.active");
    expect(mocks.db.mock.calls[1]?.[0]).toContain("store_accounts.business_status=eq.active");
    expect(mocks.db.mock.calls[1]?.[0]).not.toContain("app_users!inner");
  });

  it("rejects an inactive auth user before checking memberships", async () => {
    mocks.db.mockResolvedValue([]);
    await expect(hasActiveStoreMembership(authUserId)).resolves.toBe(false);
    expect(mocks.db).toHaveBeenCalledExactlyOnceWith(`app_users?select=id&id=eq.${authUserId}&status=eq.active&limit=1`);
  });
});
