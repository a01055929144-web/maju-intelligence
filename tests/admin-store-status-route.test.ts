import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), update: vi.fn() }));
vi.mock("../lib/auth", () => ({ requireAdminSession: mocks.session }));
vi.mock("../lib/admin-store-status", () => ({ setAdminStoreStatus: mocks.update }));

import { POST } from "../app/api/admin/stores/status/route";

const input = {
  companyId: "00000000-0000-4000-8000-000000000001",
  storeProfileId: "00000000-0000-4000-8000-000000000002",
  status: "suspended",
  requestKey: "request-000000000001",
};
const request = () => new Request("http://localhost/api/admin/stores/status", { method: "POST", body: JSON.stringify(input) });

describe("POST /api/admin/stores/status", () => {
  beforeEach(() => {
    mocks.session.mockReset();
    mocks.update.mockReset();
    delete process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS;
  });

  it("rejects signed-out and operator sessions before any write", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ role: "operator", name: "운영자" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("stays off unless the target company is allowlisted", async () => {
    mocks.session.mockResolvedValue({ role: "super_admin", name: "대표 관리자", userId: "00000000-0000-4000-8000-000000000003" });
    expect((await POST(request())).status).toBe(404);
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = "00000000-0000-4000-8000-000000000009";
    expect((await POST(request())).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("passes only validated scope and trusted actor data to the atomic write", async () => {
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = input.companyId;
    mocks.session.mockResolvedValue({ role: "super_admin", name: "대표 관리자", userId: "00000000-0000-4000-8000-000000000003" });
    mocks.update.mockResolvedValue({ ...input, auditLogId: "audit", alreadyApplied: false });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(input, { name: "대표 관리자", userId: "00000000-0000-4000-8000-000000000003" });
  });

  it("returns retryable guidance for an idempotency conflict", async () => {
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = input.companyId;
    mocks.session.mockResolvedValue({ role: "super_admin", name: "대표 관리자" });
    mocks.update.mockRejectedValue(new Error("admin_store_status_idempotency_conflict"));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("새 요청 키");
  });

  it("does not report success when the atomic audit write fails", async () => {
    process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS = input.companyId;
    mocks.session.mockResolvedValue({ role: "super_admin", name: "대표 관리자" });
    mocks.update.mockRejectedValue(new Error("synthetic_audit_failure"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain("바꾸지 못했습니다");
  });
});
