import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(), list: vi.fn(), preview: vi.fn(), save: vi.fn(), set: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ requireAdminSession: mocks.requireAdminSession }));
vi.mock("@/lib/admin-distributor-industries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-distributor-industries")>("@/lib/admin-distributor-industries");
  return { ...actual, listDistributorIndustries: mocks.list, previewCompanyDistributorIndustries: mocks.preview,
    previewDistributorIndustryCategory: vi.fn(), saveDistributorIndustryCategory: mocks.save,
    setCompanyDistributorIndustries: mocks.set };
});
import { GET, POST } from "../app/api/admin/distributor-industries/route";

const companyA = "00000000-0000-4000-8000-000000000001";
const companyB = "00000000-0000-4000-8000-000000000002";

describe("admin distributor industries route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_ADMIN_DISTRIBUTOR_INDUSTRIES_COMPANY_IDS = companyA;
    mocks.requireAdminSession.mockResolvedValue({ name: "관리자" });
  });

  it("blocks unauthenticated access before reading", async () => {
    mocks.requireAdminSession.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/api/admin/distributor-industries?companyId=${companyA}`) as never);
    expect(response.status).toBe(401); expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns 404 outside the exact company allowlist", async () => {
    const response = await GET(new Request(`http://localhost/api/admin/distributor-industries?companyId=${companyB}`) as never);
    expect(response.status).toBe(404); expect(mocks.list).not.toHaveBeenCalled();
  });

  it("reads only the allowed company", async () => {
    mocks.list.mockResolvedValue({ companyId: companyA, categories: [], assignedCategoryIds: [] });
    const response = await GET(new Request(`http://localhost/api/admin/distributor-industries?companyId=${companyA}`) as never);
    expect(response.status).toBe(200); expect(mocks.list).toHaveBeenCalledWith(companyA);
  });

  it("requires preview input and scopes assignment writes", async () => {
    mocks.set.mockResolvedValue({ companyId: companyA });
    const response = await POST(new Request("http://localhost/api/admin/distributor-industries", { method: "POST", body: JSON.stringify({ action: "set_assignment", companyId: companyA, categoryIds: [], requestKey: "request-1" }) }) as never);
    expect(response.status).toBe(200); expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ companyId: companyA, actorName: "관리자" }));
  });
});
