import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  getRequestAuthScope: vi.fn(),
  scopeHasCapability: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getCustomerOperationalName: vi.fn(() => "합성 담당"),
  getRequestAuthScope: mocks.getRequestAuthScope,
  scopeHasCapability: mocks.scopeHasCapability
}));
vi.mock("@/lib/lead-bulk-enrichment", () => ({
  executeLeadBulkItem: vi.fn(),
  leadBulkRepository: {
    createJob: mocks.createJob,
    getJob: vi.fn(),
    requestCancel: vi.fn(),
    retryFailed: vi.fn()
  }
}));
vi.mock("@/lib/lead-bulk-enrichment-feature", () => ({
  leadBulkDailyCap: vi.fn(() => 100),
  leadBulkEnrichmentEnabled: vi.fn(() => true),
  leadBulkMinIntervalMs: vi.fn(() => 500),
  leadBulkRunBudgetMs: vi.fn(() => 10_000)
}));

import { POST } from "../app/api/leads/bulk-enrichment/route";

const companyId = "10000000-0000-4000-8000-000000000001";
const request = (extra: Record<string, unknown> = {}) => new NextRequest("https://maju.example/api/leads/bulk-enrichment", {
  body: JSON.stringify({
    action: "external_info",
    idempotencyKey: "20000000-0000-4000-8000-000000000001",
    leadIds: ["30000000-0000-4000-8000-000000000001"],
    ...extra
  }),
  headers: { "Content-Type": "application/json" },
  method: "POST"
});

describe("lead bulk enrichment route errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestAuthScope.mockResolvedValue({ ok: true, companyId, customerSession: { name: "합성 담당" } });
    mocks.scopeHasCapability.mockReturnValue(true);
  });

  it("hides unexpected repository details behind a fixed 500 message", async () => {
    const sensitive = "Supabase 500: relation lead_bulk_jobs missing at https://internal.example";
    mocks.createJob.mockRejectedValue(new Error(sensitive));
    const response = await POST(request());
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ message: "일괄 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    expect(JSON.stringify(payload)).not.toContain("lead_bulk_jobs");
  });

  it.each([
    ["daily_limit_exceeded: 100", 429, "회사 일일 외부 조회 한도를 모두 사용했습니다."],
    ["lead_not_found: private-id", 404, "리드를 찾을 수 없습니다."],
    ["job_not_found: private-id", 404, "작업을 찾을 수 없습니다."],
    ["job_cancelled: private-id", 409, "취소된 작업은 다시 처리할 수 없습니다."],
    ["no_failed_items: private-id", 409, "다시 처리할 실패 항목이 없습니다."]
  ])("maps %s to a safe response", async (error, status, message) => {
    mocks.createJob.mockRejectedValue(new Error(error));
    const response = await POST(request({ companyId: "forged-company" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
    expect(mocks.createJob).toHaveBeenCalledWith(expect.objectContaining({ companyId }));
  });

  it("keeps the permission and idempotency guards before repository writes", async () => {
    mocks.scopeHasCapability.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createJob).not.toHaveBeenCalled();

    mocks.scopeHasCapability.mockReturnValue(true);
    expect((await POST(request({ idempotencyKey: "bad" }))).status).toBe(400);
    expect(mocks.createJob).not.toHaveBeenCalled();
  });
});
