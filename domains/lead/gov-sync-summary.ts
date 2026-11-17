// CC-60: 공공데이터(정부 인허가) 수집 상태 요약. lead_sync_runs(source=gov)의 행과 metadata(CX-43: partial · pendingAreaCount · areas[].status)만 읽는다.
export type GovSyncRunRow = {
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly fetched_count: number | null;
  readonly status: string;
  readonly metadata: { readonly dataset?: string; readonly pendingAreaCount?: number; readonly areas?: ReadonlyArray<{ readonly status?: string }> } | null;
};

export type GovSyncSummary = {
  readonly lastRunAt: string | null;
  /** success = 지역 누락 없이 끝남 · partial = 일부 지역 남음(이어받기) · error = 하나도 못 가져옴 */
  readonly result: "none" | "success" | "partial" | "error";
  readonly errorAreas: number;
  readonly deferredAreas: number;
  /** 데이터셋별 가장 최근 실행이 남긴 이월 지역 수의 합. */
  readonly pendingAreas: number;
  /** 최근 7일 성공 실행이 가져온 행 수(신규·갱신 합 — 새 리드 수 아님). */
  readonly weekFetched: number;
  /** CC-68: 마지막 실행이 지역을 모두 돌았는데 새 행이 0건(CX-57 "변경 없음 = 성공"). 실패가 아니다. */
  readonly noNewRows: boolean;
  readonly message: string;
};

const DAY_MS = 86_400_000;
const time = (run: Pick<GovSyncRunRow, "started_at" | "finished_at">) => Date.parse(run.finished_at || run.started_at);

export function summarizeGovSync(runs: readonly GovSyncRunRow[], now: Date = new Date()): GovSyncSummary {
  const finished = runs.filter((run) => run.status !== "running").sort((a, b) => time(b) - time(a));
  const latest = finished[0];
  if (!latest) return { lastRunAt: null, result: "none", errorAreas: 0, deferredAreas: 0, pendingAreas: 0, weekFetched: 0, noNewRows: false, message: "아직 수집 기록이 없습니다." };

  const areas = latest.metadata?.areas ?? [];
  const errorAreas = areas.filter((area) => area.status === "error").length;
  const deferredAreas = areas.filter((area) => area.status === "deferred").length;
  const latestPerDataset = new Map<string, GovSyncRunRow>();
  for (const run of finished) {
    const key = run.metadata?.dataset ?? "unknown";
    if (!latestPerDataset.has(key)) latestPerDataset.set(key, run);
  }
  const pendingAreas = Array.from(latestPerDataset.values()).reduce((sum, run) => sum + (run.metadata?.pendingAreaCount ?? 0), 0);
  const weekFetched = finished.filter((run) => run.status === "success" && now.getTime() - time(run) <= 7 * DAY_MS).reduce((sum, run) => sum + (run.fetched_count ?? 0), 0);

  const result = latest.status === "error" ? "error" : (latest.metadata?.pendingAreaCount ?? 0) > 0 ? "partial" : "success";
  const noNewRows = result === "success" && (latest.fetched_count ?? 0) === 0;
  const parts = [errorAreas ? `오류 ${errorAreas}곳` : "", deferredAreas ? `시간 예산 이월 ${deferredAreas}곳` : ""].filter(Boolean);
  const message = result === "error"
    ? `수집 실패${parts.length ? ` · ${parts.join(" · ")}` : ""}`
    : result === "partial"
      ? `일부 완료 · 남은 ${latest.metadata?.pendingAreaCount ?? 0}곳은 다음 실행에서 이어받음${parts.length ? ` (${parts.join(" · ")})` : ""}`
      : noNewRows ? `새 행 없음(지역 ${areas.length}곳 확인)` : "정상 · 남은 지역 없음";
  return { lastRunAt: latest.finished_at || latest.started_at, result, errorAreas, deferredAreas, pendingAreas, weekFetched, noNewRows, message };
}
