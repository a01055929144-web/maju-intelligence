"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { formatKstDate } from "@/domains/shared/kst-date";
import type { GovSyncSummary } from "@/domains/lead/gov-sync-summary";

// CC-60: "전국 공공데이터" 수집 상태 한 덩어리 — 마지막 실행 · 결과 · 남은(이월) 지역 · 다음 실행 · 최근 7일 수집. 읽기만 한다.
const RESULT_LABEL = { none: "기록 없음", success: "성공", partial: "일부 완료(이어받기)", error: "실패" } as const;
const RESULT_CLASS = { none: "text-slate-500", success: "text-emerald-700", partial: "text-amber-700", error: "text-rose-600" } as const;
// 자동 수집 시간표(.github/workflows/gov-sync-schedule.yml · Vercel 정기 실행): 15분마다(한국 08:00~다음날 05:59), 06시대는 하루 1번.
const NEXT_RUN_TEXT = "자동 수집: 15분마다(한국 08:00~다음날 05:59) · 하루 1번 06:00";

export function GovSyncOverview() {
  const [summary, setSummary] = useState<GovSyncSummary | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch("/api/leads/gov-sync-overview", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { summary?: GovSyncSummary; message?: string } | null;
        if (cancelled) return;
        if (!response.ok || !payload?.summary) setError(payload?.message || "수집 상태를 불러오지 못했습니다.");
        else setSummary(payload.summary);
      })
      .catch(() => { if (!cancelled) setError("수집 상태를 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [attempt]);

  if (error) return <ErrorState bare message={error} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!summary) return <LoadingState bare label="공공데이터 수집 상태를 불러오는 중입니다..." />;
  return (
    <div aria-label="전국 공공데이터 수집 상태" className="space-y-0.5" role="group">
      <p className="text-slate-500">전국 공공데이터 수집 상태</p>
      <p className={RESULT_CLASS[summary.result]}>
        마지막 실행 · {summary.lastRunAt ? formatKstDate(summary.lastRunAt, "datetime") : "—"} · {RESULT_LABEL[summary.result]}
      </p>
      <p className="text-slate-700">{summary.message}</p>
      <p className="text-slate-700">남은(이월) 지역 {summary.pendingAreas.toLocaleString("ko-KR")}곳 · 최근 7일 수집 {summary.weekFetched.toLocaleString("ko-KR")}건</p>
      <p className="text-slate-500">{NEXT_RUN_TEXT}</p>
    </div>
  );
}
