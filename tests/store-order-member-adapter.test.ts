import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getStoreOrderActor } from "../lib/pricing/store-order-member";
const scope = { companyId: "company", customerId: "customer" };
const member = { ...scope, status: "active", storeAccountId: "10000000-0000-4000-8000-000000000001", memberId: "20000000-0000-4000-8000-000000000001", authUserId: "30000000-0000-4000-8000-000000000001" };
it("keeps unconnected 07 adapter closed and accepts only matching active member context", async () => {
  expect(await getStoreOrderActor(scope)).toBeNull();
  const resolve = vi.fn().mockResolvedValue(member);
  expect(await getStoreOrderActor(scope, resolve)).toEqual({ storeAccountId: member.storeAccountId, memberId: member.memberId, authUserId: member.authUserId });
  expect(resolve).toHaveBeenCalledWith(scope);
  for (const changed of [{ status: "removed" }, { companyId: "other" }, { customerId: "other" }, { memberId: "invalid" }, { storeAccountId: "invalid" }]) {
    expect(await getStoreOrderActor(scope, async () => ({ ...member, ...changed }))).toBeNull();
  }
});
