import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn(), member: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/store/08-store-cost-access", () => ({ getStoreCostMemberAccess: mocks.member }));

import { getStoreOrderMemberContext } from "../lib/store/07-store-member-context";

describe("store order member context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives the store from token-scoped company and customer before checking the session member", async () => {
    mocks.db.mockResolvedValue([{ id: "store" }]);
    mocks.session.mockResolvedValue({ authUserId: "user" });
    mocks.member.mockResolvedValue({ id: "member", role: "staff", status: "active" });
    await expect(getStoreOrderMemberContext({ companyId: "company", customerId: "customer" })).resolves.toEqual({
      authUserId: "user", companyId: "company", customerId: "customer", memberId: "member",
      role: "staff", status: "active", storeAccountId: "store"
    });
    expect(mocks.db.mock.calls[0][0]).toContain("company_id=eq.company&customer_id=eq.customer");
    expect(mocks.member).toHaveBeenCalledWith({ authUserId: "user", companyId: "company", storeAccountId: "store" });
  });

  it("fails closed when the token company and customer have no active store", async () => {
    mocks.db.mockResolvedValue([]);
    await expect(getStoreOrderMemberContext({ companyId: "other", customerId: "customer" })).resolves.toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
