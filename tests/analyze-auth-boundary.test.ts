import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), capability: vi.fn(), save: vi.fn() }));
vi.mock("@/domains/customer/customer-import-limits", () => ({ getCustomerImportLimitMessage: () => null }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/store", () => ({ saveAnalysis: mocks.save }));

import { POST } from "../app/api/analyze/route";

const row = { name: "합성 거래처" };
const request = (body: Record<string, unknown>) => new NextRequest("https://example.test/api/analyze", {
  method: "POST", body: JSON.stringify({ rows: [row], uploadType: "customer-master", ...body })
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capability.mockReturnValue(true);
  mocks.save.mockResolvedValue({ companyId: "trusted-company", importId: "import", persisted: true,
    pipeline: {}, report: {}, reportId: "report", uploadedFileId: "upload" });
});

describe("POST /api/analyze authorization boundary", () => {
  it("rejects anonymous and capability-revoked requests before persistence", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, role: "anonymous" });
    expect((await POST(request({ companyId: "forged" }))).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ ok: true, companyId: "trusted-company", role: "customer" });
    mocks.capability.mockReturnValueOnce(false);
    expect((await POST(request({ companyId: "forged" }))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("uses the authenticated customer company instead of the requested company", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId: "trusted-company", role: "customer" });
    expect((await POST(request({ companyId: "forged-company" }))).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "forged-company");
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), "manage_customers");
    expect(mocks.save).toHaveBeenCalledWith([row], undefined, expect.objectContaining({ companyId: "trusted-company" }));
  });

  it("allows the centralized admin scope to select an explicit company", async () => {
    mocks.auth.mockResolvedValue({ ok: true, companyId: "selected-company", role: "admin" });
    await POST(request({ companyId: "selected-company", uploadType: "sales-analysis" }));
    expect(mocks.capability).toHaveBeenCalledWith(expect.anything(), "manage_sales");
    expect(mocks.save).toHaveBeenCalledWith([row], undefined, expect.objectContaining({ companyId: "selected-company" }));
  });
});
