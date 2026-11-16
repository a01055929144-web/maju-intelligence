import { describe, expect, it, vi } from "vitest";
import { readLatestReport, readReportById } from "../lib/analytics/report-read";
import type { AnalysisResult } from "../lib/analysis";

const emptyReport = { customers: 0 } as AnalysisResult;
const savedReport = { customers: 12 } as AnalysisResult;

describe("analytics report reads", () => {
  it("does not query across companies when the company id is missing", async () => {
    const request = vi.fn();
    await expect(readLatestReport(request, undefined, () => emptyReport, vi.fn())).resolves.toBe(emptyReport);
    await expect(readReportById(request, "report-1", undefined)).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("scopes latest and id reads to the requested company", async () => {
    const request = vi.fn(async () => [{ report: savedReport }]);
    const typedRequest = request as unknown as Parameters<typeof readLatestReport>[0];

    await expect(readLatestReport(typedRequest, "company/a", () => emptyReport, vi.fn())).resolves.toBe(savedReport);
    await expect(readReportById(typedRequest, "report/b", "company/a")).resolves.toBe(savedReport);
    expect(request.mock.calls[0][0]).toContain("company_id=eq.company%2Fa");
    expect(request.mock.calls[1][0]).toContain("id=eq.report%2Fb");
    expect(request.mock.calls[1][0]).toContain("company_id=eq.company%2Fa");
  });

  it("falls back to current customer analysis when no saved report exists", async () => {
    const analyzeCurrent = vi.fn(async () => savedReport);
    const request = (async () => []) as Parameters<typeof readLatestReport>[0];
    await expect(readLatestReport(request, "company", () => emptyReport, analyzeCurrent)).resolves.toBe(savedReport);
    expect(analyzeCurrent).toHaveBeenCalledWith("company");
  });

  it("returns an empty report when both the read and fallback fail", async () => {
    const request = (async () => { throw new Error("read failed"); }) as Parameters<typeof readLatestReport>[0];
    const analyzeCurrent = vi.fn(async () => { throw new Error("fallback failed"); });
    await expect(readLatestReport(request, "company", () => emptyReport, analyzeCurrent)).resolves.toBe(emptyReport);
  });
});
