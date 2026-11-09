import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ member: vi.fn() }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: mocks.member }));
import { getStoreOrderActor } from "../lib/pricing/store-order-member";
const scope = { companyId: "company", customerId: "customer" };
const member = { ...scope, role: "staff", status: "active", storeAccountId: "10000000-0000-4000-8000-000000000001", memberId: "20000000-0000-4000-8000-000000000001", authUserId: "30000000-0000-4000-8000-000000000001" };
it("uses the verified 07 member context", async () => {
  mocks.member.mockResolvedValue(null);
  expect(await getStoreOrderActor(scope)).toBeNull();
  expect(mocks.member).toHaveBeenCalledWith(scope);
});
it.each(["owner", "manager", "staff"] as const)("accepts a verified active %s for the existing member order RPC", async role => {
  expect(await getStoreOrderActor(scope, async () => ({ ...member, role }))).toEqual({
    storeAccountId: member.storeAccountId, memberId: member.memberId, authUserId: member.authUserId,
  });
});
it("blocks removed and cross-scope members before the order RPC", async () => {
  for (const changed of [{ status: "removed" }, { companyId: "other" }, { customerId: "other" }, { memberId: "invalid" }, { storeAccountId: "invalid" }]) {
    expect(await getStoreOrderActor(scope, async () => ({ ...member, ...changed }))).toBeNull();
  }
});
