import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), member: vi.fn() }));
vi.mock("@/lib/store/07-store-settlement-account", () => ({ getStoreSettlementAccount: mocks.read }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.member }));
import { GET } from "@/app/api/store/settlement-account/route";

const companyId = "00000000-0000-4000-8000-000000000001", storeAccountId = "20000000-0000-4000-8000-000000000001";
const request = (company = companyId, store = storeAccountId) => new NextRequest(`https://test/api/store/settlement-account?companyId=${company}&storeAccountId=${store}`);
describe("store settlement account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.member.mockResolvedValue({ companyId, storeAccountId, memberId: "member", authUserId: "user", role: "owner" });
  });
  it("rejects malformed or unavailable scopes without exposing account data", async () => {
    expect((await GET(request("forged"))).status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
  });
  it("returns the account only from the verified server helper", async () => {
    mocks.read.mockResolvedValue({ bank: "합성은행", number: "123", holder: "예금주" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: { bank: "합성은행", number: "123", holder: "예금주" } });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
      { companyId, storeAccountId },
      expect.objectContaining({ companyId, storeAccountId, role: "owner" }),
    );
  });
});
