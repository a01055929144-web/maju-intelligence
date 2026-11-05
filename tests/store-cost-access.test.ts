import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAccessStoreCosts } from "../domains/organization/store-cost-access";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { getStoreCostMemberAccess } from "../lib/store/08-store-cost-access";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const authUserId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => vi.clearAllMocks());

describe("store cost membership boundary", () => {
  it("checks the authenticated Kakao user inside the company and store-account pair", async () => {
    mocks.db.mockResolvedValue([{ id: "member-1", role: "owner", status: "active", private_value: "not returned" }]);

    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toEqual({
      id: "member-1", role: "owner", status: "active"
    });
    expect(mocks.db).toHaveBeenCalledExactlyOnceWith(
      `store_account_members?select=id,role,status&company_id=eq.${companyId}&store_account_id=eq.${storeAccountId}&auth_user_id=eq.${authUserId}&status=eq.active&limit=1`
    );
  });

  it("rejects token-only, missing-user and malformed identifiers before database access", async () => {
    await expect(getStoreCostMemberAccess({ companyId, storeAccountId } as never)).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId: "public-link-token", companyId, storeAccountId })).resolves.toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("rejects inactive, unknown-role and cross-company or cross-store lookups", async () => {
    mocks.db
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "member-1", role: "owner", status: "removed" }])
      .mockResolvedValueOnce([{ id: "member-1", role: "administrator", status: "active" }]);

    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
    await expect(getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })).resolves.toBeNull();
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
