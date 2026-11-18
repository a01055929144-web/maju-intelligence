import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), enabled: vi.fn(), operationalName: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCustomerOperationalName: mocks.operationalName,
  getRequestAuthScope: mocks.auth,
  scopeHasCapability: mocks.capability
}));
vi.mock("@/lib/lead-favorites", () => ({
  leadFavoriteRepository: { set: mocks.set },
  leadFavoritesEnabled: mocks.enabled
}));

import { PUT } from "../app/api/leads/[id]/favorite/route";

const leadId = "00000000-0000-4000-8000-000000000011";
const request = (body: unknown) => new NextRequest(`https://example.test/api/leads/${leadId}/favorite`, {
  method: "PUT",
  body: JSON.stringify(body)
});
const context = { params: Promise.resolve({ id: leadId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.capability.mockReturnValue(true);
  mocks.operationalName.mockReturnValue("현장 담당자");
  mocks.set.mockResolvedValue({ leadId, starred: true, starredAt: "2026-11-17T00:00:00Z", starredByName: "현장 담당자", starredByUserId: "user-1" });
});

describe("PUT /api/leads/:id/favorite", () => {
  it("rejects anonymous and disabled-company requests before persistence", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, role: "anonymous" });
    expect((await PUT(request({ starred: true }), context)).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ ok: true, companyId: "company-1", customerSession: {}, role: "customer" });
    mocks.enabled.mockReturnValueOnce(false);
    expect((await PUT(request({ starred: true }), context)).status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("uses the authenticated company and records the authenticated actor", async () => {
    mocks.auth.mockResolvedValue({
      ok: true,
      companyId: "trusted-company",
      customerSession: { userId: "user-1" },
      adminSession: null,
      role: "customer"
    });
    const response = await PUT(request({ companyId: "forged-company", starred: true }), context);
    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "forged-company");
    expect(mocks.enabled).toHaveBeenCalledWith("trusted-company");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      actorName: "현장 담당자",
      actorUserId: "user-1",
      companyId: "trusted-company",
      leadId,
      starred: true
    }));
  });

  it("rejects malformed state without authentication or persistence", async () => {
    expect((await PUT(request({ starred: "yes" }), context)).status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("returns 403 without customer management permission", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId: "company-1", customerSession: {}, role: "customer" });
    mocks.capability.mockReturnValue(false);
    expect((await PUT(request({ starred: true }), context)).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
