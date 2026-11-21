import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSalesKit } from "../domains/lead/sales-kit";

const mocks = vi.hoisted(() => ({
  getRequestAuthScope: vi.fn(),
  getSalesKit: vi.fn(),
  saveSalesKit: vi.fn(),
  scopeHasCapability: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.getRequestAuthScope, scopeHasCapability: mocks.scopeHasCapability }));
vi.mock("@/lib/sales-kit-store", () => ({
  getSalesKit: mocks.getSalesKit,
  getSalesKitContactFallback: vi.fn(),
  saveSalesKit: mocks.saveSalesKit
}));

import { PUT } from "../app/api/sales-kit/route";

const companyId = "11111111-1111-1111-1111-111111111111";
const request = (body: unknown) => new NextRequest("https://maju.example/api/sales-kit", {
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
  method: "PUT"
});

describe("sales kit public contact consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestAuthScope.mockResolvedValue({ ok: true, companyId, role: "customer" });
    mocks.getSalesKit.mockResolvedValue(parseSalesKit(null));
    mocks.saveSalesKit.mockImplementation(async (_companyId, kit) => kit);
  });

  it("keeps the existing manage-company permission boundary", async () => {
    mocks.scopeHasCapability.mockReturnValue(false);
    const response = await PUT(request({ contactPhone: "01012345678", publicContactEnabled: true }));
    expect(response.status).toBe(403);
    expect(mocks.saveSalesKit).not.toHaveBeenCalled();
  });

  it("saves consent only with a directly entered phone", async () => {
    mocks.scopeHasCapability.mockReturnValue(true);
    expect((await PUT(request({ contactLabel: "영업팀", contactPhone: "010-1234-5678", publicContactEnabled: true }))).status).toBe(200);
    expect(mocks.saveSalesKit).toHaveBeenLastCalledWith(companyId, expect.objectContaining({ contactLabel: "영업팀", contactPhone: "010-1234-5678", publicContactEnabled: true }));

    expect((await PUT(request({ contactPhone: "", publicContactEnabled: true }))).status).toBe(200);
    expect(mocks.saveSalesKit).toHaveBeenLastCalledWith(companyId, expect.objectContaining({ contactPhone: "", publicContactEnabled: false }));
  });
});
