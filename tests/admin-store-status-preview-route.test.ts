import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth", () => ({ requireAdminSession: session }));

import { POST } from "../app/api/admin/stores/status-preview/route";

const input = {
  companyId: "00000000-0000-4000-8000-000000000001",
  storeProfileId: "10000000-0000-4000-8000-000000000001",
  status: "suspended",
  requestKey: "10000000-0000-4000-8000-000000000099",
};
const request = () => new Request("http://localhost/api/admin/stores/status-preview", { method: "POST", body: JSON.stringify(input) });

describe("admin store status preview API", () => {
  beforeEach(() => {
    session.mockReset();
    delete process.env.CI_ADMIN_STORE_FIXTURES;
    delete process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS;
    delete process.env.VERCEL_ENV;
  });

  it("rejects signed-out and operator sessions", async () => {
    session.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    session.mockResolvedValueOnce({ role: "operator", name: "운영자" });
    expect((await POST(request())).status).toBe(403);
  });

  it("is unavailable in production even when fixture flags are present", async () => {
    session.mockResolvedValue({ role: "super_admin", name: "대표 관리자" });
    process.env.CI_ADMIN_STORE_FIXTURES = "enabled";
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = input.companyId;
    process.env.VERCEL_ENV = "production";
    expect((await POST(request())).status).toBe(404);
  });

  it("accepts only the allowlisted synthetic company and store", async () => {
    session.mockResolvedValue({ role: "super_admin", name: "대표 관리자" });
    process.env.CI_ADMIN_STORE_FIXTURES = "enabled";
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = input.companyId;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "suspended", storeProfileId: input.storeProfileId });
    const foreign = new Request("http://localhost/api/admin/stores/status-preview", { method: "POST", body: JSON.stringify({ ...input, companyId: "00000000-0000-4000-8000-000000000002" }) });
    expect((await POST(foreign)).status).toBe(400);
  });
});
