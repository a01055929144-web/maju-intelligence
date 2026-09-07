/**
 * Best-effort daily cap on manual permit-lead sync calls (gov/seoul), per company per source.
 *
 * In-memory, single-instance limiter -- like lib/rate-limit.ts, this does not share state
 * across concurrent Vercel instances or survive cold starts. It will not stop a determined,
 * distributed abuser, but it does stop the realistic case: a company's own staff repeatedly
 * clicking "이어서 계속 수집" (or the single-shot sync button) many times within the same
 * warm instance's lifetime and burning the external API quota well past what a normal day's
 * lead-collection needs.
 */

type DailyCounter = { calls: number; dayIndex: number };

const DAILY_CALL_CAP = 60; // roughly two full 25-round chained scans -- generous for legitimate re-scans, blocks runaway repeat-clicking

const counters = new Map<string, DailyCounter>();

function currentDayIndex() {
  return Math.floor(Date.now() / 86400000);
}

export function checkSyncDailyCap(companyId: string, source: "gov" | "seoul"): { allowed: boolean; callsToday: number } {
  const key = `${source}:${companyId}`;
  const dayIndex = currentDayIndex();
  const record = counters.get(key);
  if (!record || record.dayIndex !== dayIndex) {
    return { allowed: true, callsToday: 0 };
  }
  return { allowed: record.calls < DAILY_CALL_CAP, callsToday: record.calls };
}

export function recordSyncCall(companyId: string, source: "gov" | "seoul") {
  const key = `${source}:${companyId}`;
  const dayIndex = currentDayIndex();
  const record = counters.get(key);
  if (!record || record.dayIndex !== dayIndex) {
    counters.set(key, { calls: 1, dayIndex });
    return;
  }
  record.calls += 1;
}
