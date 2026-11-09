import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), db: vi.fn(), session: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("../lib/store/08-store-cost-access", () => ({ getStoreCostMemberAccess: mocks.access }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { getStoreMemberContext, getStoreOrderMemberContextForCompany } from "../lib/store/07-store-member-context";

const authUserId = "00000000-0000-4000-8000-000000000003";
const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("store member context", () => {
  it("derives identity only from the signed session and rechecks the active company/store membership", async () => {
    mocks.session.mockResolvedValue({ authUserId, issuedAt: 1, expiresAt: 2 });
    mocks.access.mockResolvedValue({ id: "member-1", role: "staff", status: "active" });
    await expect(getStoreMemberContext({ companyId, storeAccountId })).resolves.toEqual({
      authUserId, companyId, memberId: "member-1", role: "staff", status: "active", storeAccountId
    });
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith({ authUserId, companyId, storeAccountId });
  });

  it("never treats a public link or caller field as member identity", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(getStoreMemberContext({ companyId, storeAccountId })).resolves.toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("rejects removed, cross-company and cross-store membership misses", async () => {
    mocks.session.mockResolvedValue({ authUserId, issuedAt: 1, expiresAt: 2 });
    mocks.access.mockResolvedValue(null);
    await expect(getStoreMemberContext({ companyId, storeAccountId })).resolves.toBeNull();
  });

  it("resolves the single active company store after public owner onboarding", async () => {
    mocks.session.mockResolvedValue({ authUserId, issuedAt: 1, expiresAt: 2 });
    mocks.db.mockResolvedValueOnce([{ store_account_id: storeAccountId }]).mockResolvedValueOnce([{ customer_id: "customer-1" }]);
    mocks.access.mockResolvedValue({ id: "member-1", role: "owner", status: "active" });
    await expect(getStoreOrderMemberContextForCompany(companyId)).resolves.toMatchObject({
      companyId, customerId: "customer-1", storeAccountId, memberId: "member-1", role: "owner"
    });
  });

  it("fails closed when the signed member has multiple stores in the company", async () => {
    mocks.session.mockResolvedValue({ authUserId, issuedAt: 1, expiresAt: 2 });
    mocks.db.mockResolvedValueOnce([{ store_account_id: storeAccountId }, { store_account_id: "another" }]);
    await expect(getStoreOrderMemberContextForCompany(companyId)).resolves.toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
