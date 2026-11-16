import { describe, expect, it } from "vitest";
import { summarizeGovSync, type GovSyncRunRow } from "./gov-sync-summary";

const now = new Date("2026-11-17T00:00:00Z");
const run = (over: Partial<GovSyncRunRow> & { started_at: string }): GovSyncRunRow => ({ finished_at: over.started_at, fetched_count: 10, status: "success", metadata: { dataset: "general_restaurants", pendingAreaCount: 0, areas: [] }, ...over });

describe("summarizeGovSync (CC-60)", () => {
  it("기록이 없으면 안내", () => {
    expect(summarizeGovSync([], now)).toMatchObject({ result: "none", lastRunAt: null, weekFetched: 0 });
  });
  it("성공 · 남은 지역 없음, 최근 7일 수집 합계(8일 전 것은 제외)", () => {
    const summary = summarizeGovSync([run({ started_at: "2026-11-16T10:00:00Z" }), run({ started_at: "2026-11-15T10:00:00Z", fetched_count: 5 }), run({ started_at: "2026-11-01T10:00:00Z", fetched_count: 99 })], now);
    expect(summary).toMatchObject({ result: "success", pendingAreas: 0, weekFetched: 15, message: "정상 · 남은 지역 없음" });
  });
  it("일부 지역이 남으면 partial + 남은 지역 수(데이터셋별 최신 실행 합)", () => {
    const summary = summarizeGovSync([
      run({ started_at: "2026-11-16T10:00:00Z", metadata: { dataset: "general_restaurants", pendingAreaCount: 2, areas: [{ status: "success" }, { status: "deferred" }, { status: "deferred" }] } }),
      run({ started_at: "2026-11-16T09:00:00Z", metadata: { dataset: "bakeries", pendingAreaCount: 1 } }),
      run({ started_at: "2026-11-15T09:00:00Z", metadata: { dataset: "bakeries", pendingAreaCount: 7 } })
    ], now);
    expect(summary.result).toBe("partial");
    expect(summary.pendingAreas).toBe(3);
    expect(summary.message).toContain("남은 2곳");
    expect(summary.message).toContain("시간 예산 이월 2곳");
  });
  it("실패는 숫자로: 오류 2곳 · 시간 예산 이월 2곳", () => {
    const summary = summarizeGovSync([run({ started_at: "2026-11-16T10:00:00Z", status: "error", fetched_count: 0, metadata: { dataset: "general_restaurants", pendingAreaCount: 4, areas: [{ status: "error" }, { status: "error" }, { status: "deferred" }, { status: "deferred" }] } })], now);
    expect(summary).toMatchObject({ result: "error", errorAreas: 2, deferredAreas: 2, weekFetched: 0 });
    expect(summary.message).toBe("수집 실패 · 오류 2곳 · 시간 예산 이월 2곳");
  });
  it("실행 중인 행은 마지막 실행으로 보지 않는다", () => {
    expect(summarizeGovSync([run({ started_at: "2026-11-16T23:00:00Z", status: "running", finished_at: null }), run({ started_at: "2026-11-16T10:00:00Z" })], now).lastRunAt).toBe("2026-11-16T10:00:00Z");
  });
});
