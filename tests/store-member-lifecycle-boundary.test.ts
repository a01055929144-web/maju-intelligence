import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));

import { getStoreMemberContext, getStoreOrderMemberContext } from "../lib/store/07-store-member-context";
import { acceptStoreMemberInvitation, removeStoreMember } from "../lib/store/07-store-member-management";

const companyId = "10000000-0000-4000-8000-000000000001";
const customerId = "20000000-0000-4000-8000-000000000001";
const storeAccountId = "30000000-0000-4000-8000-000000000001";
const authUserId = "40000000-0000-4000-8000-000000000001";
const memberId = "50000000-0000-4000-8000-000000000001";
const actorMemberId = "50000000-0000-4000-8000-000000000002";

describe("store member lifecycle boundary", () => {
  let role: "owner" | "manager" | "staff";
  let status: "invited" | "active" | "removed";

  beforeEach(() => {
    role = "staff";
    status = "invited";
    mocks.session.mockReset();
    mocks.session.mockResolvedValue({ authUserId });
    mocks.db.mockReset();
    mocks.db.mockImplementation(async (path: string, init?: { body?: string }) => {
      if (path === "rpc/accept_store_member_invitation_v1") { status = "active"; return {}; }
      if (path === "rpc/remove_store_member_v1") { status = "removed"; return {}; }
      if (path.startsWith("store_accounts?select=id"))
        return path.includes(`company_id=eq.${companyId}`) && path.includes(`customer_id=eq.${customerId}`)
          ? [{ id: storeAccountId }] : [];
      if (path.startsWith("app_users?select=id")) return [{ id: authUserId }];
      if (path.startsWith("store_account_members?select=id,role,status")) {
        const sameScope = path.includes(`company_id=eq.${companyId}`) &&
          path.includes(`store_account_id=eq.${storeAccountId}`) && path.includes(`auth_user_id=eq.${authUserId}`);
        return sameScope && status === "active" ? [{ id: memberId, role, status }] : [];
      }
      throw new Error(`unexpected store boundary query: ${path} ${init?.body || ""}`);
    });
  });

  it.each(["owner", "manager", "staff"] as const)("grants %s only after acceptance, keeps retries stable, and revokes immediately", async nextRole => {
    role = nextRole;
    const scope = { companyId, customerId };
    await expect(getStoreOrderMemberContext(scope)).resolves.toBeNull();

    await acceptStoreMemberInvitation({ authUserId, companyId, storeAccountId, token: "a".repeat(43) });
    const expected = { authUserId, companyId, customerId, memberId, role, status: "active", storeAccountId };
    await expect(getStoreOrderMemberContext(scope)).resolves.toEqual(expected);
    await expect(getStoreOrderMemberContext(scope)).resolves.toEqual(expected);
    expect(JSON.stringify(expected)).not.toMatch(/cost|margin|purchase|unitPrice/i);

    await removeStoreMember({ actorMemberId, companyId, storeAccountId, targetMemberId: memberId });
    await expect(getStoreOrderMemberContext(scope)).resolves.toBeNull();
  });

  it("blocks another company, customer, or store even with the same signed user session", async () => {
    status = "active";
    await expect(getStoreOrderMemberContext({ companyId: "10000000-0000-4000-8000-000000000009", customerId })).resolves.toBeNull();
    await expect(getStoreOrderMemberContext({ companyId, customerId: "20000000-0000-4000-8000-000000000009" })).resolves.toBeNull();
    await expect(getStoreMemberContext({ companyId, storeAccountId: "30000000-0000-4000-8000-000000000009" })).resolves.toBeNull();
  });

  it("queries only identity and role fields needed by the order boundary", async () => {
    status = "active";
    await getStoreOrderMemberContext({ companyId, customerId });
    const paths = mocks.db.mock.calls.map(([path]) => String(path));
    expect(paths).toHaveLength(3);
    expect(paths.join("\n")).not.toMatch(/cost|margin|purchase|unit_price/i);
    expect(paths[2]).toContain("select=id,role,status");
  });
});
