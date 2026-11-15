import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.fn();
const read = vi.fn();
vi.mock("../lib/auth", () => ({ requireAdminSession: admin }));
vi.mock("../lib/store", () => ({ supabaseRequest: read }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("../lib/semas", () => ({ getSemasServiceKey: () => "fake-key", fetchSemasStoresInDong: vi.fn() }));
vi.mock("../lib/semas-dry-run", () => ({ runSemasDongDryRun: vi.fn() }));

describe("관리자 상가정보 dry-run API", () => {
  beforeEach(() => { admin.mockReset(); read.mockReset(); });

  it("비관리자는 존재를 숨기는 404이고 DB도 읽지 않는다", async () => {
    admin.mockResolvedValue(false);
    const { GET } = await import("../app/api/admin/leads/semas-dry-run/route");
    const response = await GET(new Request("http://localhost/api/admin/leads/semas-dry-run?companyId=00000000-0000-4000-8000-000000000001"));
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
});
