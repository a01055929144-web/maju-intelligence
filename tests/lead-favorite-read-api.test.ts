import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), enabled: vi.fn(), getMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/lead-favorites", () => ({
  leadFavoriteRepository: { getMany: mocks.getMany },
  leadFavoritesEnabled: mocks.enabled
}));

import { GET } from "../app/api/leads/favorites/route";

const first = "00000000-0000-4000-8000-000000000011";
const second = "00000000-0000-4000-8000-000000000012";
const request = (query = `companyId=admin-company&leadId=${first}&leadId=${second}`) => new NextRequest(`https://example.test/api/leads/favorites?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, companyId: "company-1", customerSession: {}, role: "customer" });
  mocks.capability.mockReturnValue(true);
  mocks.enabled.mockReturnValue(true);
  mocks.getMany.mockResolvedValue([{ leadId: first, starred: true, starredAt: "2026-11-17T00:00:00Z", starredByName: "담당자", starredByUserId: null }]);
});

describe("GET /api/leads/favorites", () => {
  it("reads multiple favorite states within the authenticated company", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "admin-company");
    expect(mocks.getMany).toHaveBeenCalledWith("company-1", [first, second]);
    expect(await response.json()).toMatchObject({ favorites: [{ leadId: first, starred: true }] });
  });

  it("rejects unauthorized, forbidden and malformed requests before reading", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, role: "anonymous" });
    expect((await GET(request())).status).toBe(401);
    mocks.capability.mockReturnValueOnce(false);
    expect((await GET(request())).status).toBe(403);
    expect((await GET(request("leadId=bad"))).status).toBe(400);
    expect(mocks.getMany).not.toHaveBeenCalled();
  });
});
