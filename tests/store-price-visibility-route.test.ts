import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), capability: vi.fn(), enabled: vi.fn(), list: vi.fn(), save: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ customerHasCapability: mocks.capability, getCustomerSession: mocks.session }));
vi.mock("@/lib/store/07-store-price-visibility-feature", () => ({ isStorePriceVisibilityEnabled: mocks.enabled }));
vi.mock("@/lib/store/07-store-price-visibility", () => ({
  getCompanyPriceVisibilityActor: mocks.actor, listStorePriceVisibility: mocks.list, setStorePriceVisibility: mocks.save
}));

import { GET, POST } from "../app/api/customer/store-price-visibility/route";

const companyId = "10000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000002";
const post = (body: unknown) => new NextRequest("https://test/api/customer/store-price-visibility", { method: "POST",
  headers: { "Content-Type": "application/json", origin: "https://test" }, body: JSON.stringify(body) });

describe("CX-122 customer price visibility route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ companyId, companyMemberId: "actor", userId: "user" });
    mocks.enabled.mockReturnValue(true); mocks.capability.mockReturnValue(true);
    mocks.actor.mockResolvedValue({ id: "verified-actor", role: "owner" }); mocks.list.mockResolvedValue([]);
  });

  it("fails closed before DB reads when the feature is off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await GET()).status).toBe(404);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });

  it("blocks staff and returns a clear permission response", async () => {
    mocks.actor.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(403); expect((await response.json()).message).toContain("점주 또는 관리자");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists pending stores only in the signed-in company scope", async () => {
    mocks.list.mockResolvedValue([{ businessStatus: "active", confirmedAt: null, id: storeAccountId, name: "매장",
      reference: { foodPermitMatch: null, joinedFromCompanyLink: true, ntsActiveBusiness: true }, status: "pending" }]);
    const response = await GET();
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ pendingCount: 1 });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(companyId);
  });

  it("ignores forged company and actor values and uses the verified scope", async () => {
    const response = await POST(post({ action: "confirm", actorCompanyMemberId: "forged", companyId: "forged", storeAccountId }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ action: "confirm", actorCompanyMemberId: "verified-actor",
      companyId, memo: "", storeAccountId });
  });

  it("blocks cross-origin writes", async () => {
    const request = new NextRequest("https://test/api/customer/store-price-visibility", { method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://evil.test" }, body: JSON.stringify({ action: "cancel", storeAccountId }) });
    expect((await POST(request)).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled();
  });
});
