import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ member: vi.fn() }));
vi.mock("../lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: mocks.member }));
import { getStoreOrderActor } from "../lib/pricing/store-order-member";
const scope = { companyId: "company", customerId: "customer" };
const member = { ...scope, status: "active", storeAccountId: "10000000-0000-4000-8000-000000000001", memberId: "20000000-0000-4000-8000-000000000001", authUserId: "30000000-0000-4000-8000-000000000001" };
it("uses the verified 07 member context and accepts only a matching active member", async () => {
  mocks.member.mockResolvedValue(null);
  expect(await getStoreOrderActor(scope)).toBeNull();
  expect(mocks.member).toHaveBeenCalledWith(scope);
  mocks.member.mockResolvedValue(member);
  expect(await getStoreOrderActor(scope)).toEqual({ storeAccountId: member.storeAccountId, memberId: member.memberId, authUserId: member.authUserId });
  const resolve = vi.fn().mockResolvedValue(member);
  expect(await getStoreOrderActor(scope, resolve)).toEqual({ storeAccountId: member.storeAccountId, memberId: member.memberId, authUserId: member.authUserId });
  expect(resolve).toHaveBeenCalledWith(scope);
  for (const changed of [{ status: "removed" }, { companyId: "other" }, { customerId: "other" }, { memberId: "invalid" }, { storeAccountId: "invalid" }]) {
    expect(await getStoreOrderActor(scope, async () => ({ ...member, ...changed }))).toBeNull();
  }
});
