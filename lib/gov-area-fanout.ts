import type { GovAreaCursor } from "./gov-area-scan";

export const GOV_FANOUT_CONCURRENCY = 2;
export const GOV_REQUEST_TIMEOUT_MS = 20_000;
// 함수 한도 60초(Hobby) 안에서: 수집 40초 + 뒤처리 여유 10초. 못 끝낸 지역은 이어받기(CX-43)로 다음 실행에.
export const GOV_COLLECTION_BUDGET_MS = 40_000;
export const GOV_POSTPROCESS_RESERVE_MS = 10_000;
export const GOV_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export class GovBudgetDeferredError extends Error {
  constructor() {
    super("정부 API 요청 시간 예산이 부족해 다음 실행으로 이월합니다.");
    this.name = "GovBudgetDeferredError";
  }
}

export type GovAreaTask = {
  areaCode: string;
  page: number;
  cutoff: string;
  scanStartedAt: string;
  kind: "latest" | "cursor";
};

export type GovAreaTaskResult<T> = GovAreaTask & {
  status: "success" | "error" | "deferred";
  elapsedMs: number;
  value?: T;
  error?: string;
};

export type GovAreaAttempt = {
  pageSize: number;
  ms: number;
  result: "timeout" | "deferred" | "success" | "error";
};

export function prioritizeGovAreaCodes(
  areaCodes: readonly string[],
  pendingAreas: readonly string[],
  previousFirstArea?: string,
  rotatePreviousFirst: boolean | "end" = true
) {
  const pending = Array.from(new Set(pendingAreas.filter((areaCode) => areaCodes.includes(areaCode))));
  const ordered = [...pending, ...areaCodes.filter((areaCode) => !pending.includes(areaCode))];
  if (rotatePreviousFirst && ordered.length > 1 && ordered[0] === previousFirstArea) {
    if (rotatePreviousFirst === "end") ordered.push(ordered.shift() as string);
    else [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
  }
  return ordered;
}

export function shouldDeferBlockedGovFirstArea(
  dataset: string,
  previousFirstArea: string | undefined,
  timeoutCounts: Readonly<Record<string, number | undefined>>
) {
  return dataset === "general_restaurants" && Boolean(previousFirstArea) && (timeoutCounts[previousFirstArea || ""] || 0) >= 2;
}

export function getGovSyncObservability(
  areaCodes: readonly string[],
  pendingAreas: readonly string[],
  results: readonly Pick<GovAreaTaskResult<unknown>, "areaCode" | "status">[],
  currentFirstArea?: string
) {
  const remainingAreas = Array.from(new Set(pendingAreas.filter((areaCode) => areaCodes.includes(areaCode))));
  const processedAreas = new Set(results.filter((result) => result.status !== "deferred").map((result) => result.areaCode));
  return {
    remainingAreaCount: remainingAreas.length,
    processedAreaCount: processedAreas.size,
    nextStartArea: prioritizeGovAreaCodes(areaCodes, remainingAreas, currentFirstArea)[0] || null
  };
}

export function isGovTimeoutError(error?: string) {
  return Boolean(error && /abort|timeout|time.?out/i.test(error));
}

export function isGovSyncStale(lastSuccessAt?: string | null, now = Date.now()) {
  const lastSuccess = lastSuccessAt ? Date.parse(lastSuccessAt) : Number.NaN;
  return !Number.isFinite(lastSuccess) || now - lastSuccess > GOV_STALE_AFTER_MS;
}

export async function loadGovAreaWithTimeoutRetry<T>(
  load: (pageSize: number) => Promise<T>,
  previousTimeoutCount = 0,
  options: {
    firstPageSize?: number;
    retryPageSize?: number;
    now?: () => number;
    onAttempt?: (attempt: GovAreaAttempt) => void;
  } = {}
) {
  const now = options.now || Date.now;
  const record = async (pageSize: number) => {
    const startedAt = now();
    try {
      const value = await load(pageSize);
      options.onAttempt?.({ pageSize, ms: Math.max(0, now() - startedAt), result: "success" });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = error instanceof GovBudgetDeferredError ? "deferred" : isGovTimeoutError(message) ? "timeout" : "error";
      options.onAttempt?.({ pageSize, ms: Math.max(0, now() - startedAt), result });
      throw error;
    }
  };
  const firstPageSize = options.firstPageSize ?? (previousTimeoutCount >= 2 ? 20 : 100);
  try {
    return await record(firstPageSize);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isGovTimeoutError(message)) throw error;
    return record(options.retryPageSize ?? (previousTimeoutCount >= 2 ? 20 : 50));
  }
}

export function buildGovAreaTasks(
  areaCodes: readonly string[],
  cursors: Readonly<Record<string, GovAreaCursor>>,
  cutoff: string,
  scanStartedAt: string
): GovAreaTask[] {
  const latest = areaCodes.map((areaCode) => ({ areaCode, page: 1, cutoff, scanStartedAt, kind: "latest" as const }));
  const continuation = areaCodes.flatMap((areaCode) => {
    const cursor = cursors[areaCode];
    return cursor && cursor.page > 1 ? [{ ...cursor, kind: "cursor" as const }] : [];
  });
  return [...latest, ...continuation];
}

/**
 * 지난 실행의 지역별 시간 초과 횟수로 작업을 "혼자 실행"(2번 이상)과 "같이 실행"으로 나눈다.
 * 횟수 기록이 없는 지역(첫 실행 · 빈 기록)은 0번으로 본다 — 11/17 06:13·07:57 운영에서
 * `undefined >= 2`와 `undefined < 2`가 둘 다 거짓이라 모든 지역이 빠져 0쪽 수집으로 멈췄다.
 */
export function splitGovTasksByTimeouts<T extends { areaCode: string }>(
  tasks: readonly T[],
  timeoutCounts: Readonly<Record<string, number | undefined>>,
  soloAfter = 2
): { solo: T[]; regular: T[] } {
  const count = (areaCode: string) => timeoutCounts[areaCode] || 0;
  return {
    solo: tasks.filter((task) => count(task.areaCode) >= soloAfter),
    regular: tasks.filter((task) => count(task.areaCode) < soloAfter)
  };
}

export function updateGovTimeoutCounts(
  areaCodes: readonly string[],
  previous: Readonly<Record<string, number | undefined>>,
  results: readonly Pick<GovAreaTaskResult<unknown>, "areaCode" | "status">[],
  attempts: Readonly<Record<string, readonly GovAreaAttempt[]>>
) {
  const next: Record<string, number> = Object.fromEntries(Object.entries(previous).map(([areaCode, count]) => [areaCode, count || 0]));
  for (const areaCode of areaCodes) {
    const areaResults = results.filter((result) => result.areaCode === areaCode);
    if (areaResults.length && areaResults.every((result) => result.status === "success")) next[areaCode] = 0;
    else if ((attempts[areaCode] || []).some((attempt) => attempt.result === "timeout")) next[areaCode] = (next[areaCode] || 0) + 1;
  }
  return next;
}

export function dedupeGovRows<T extends { sourceRecordKey?: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row, index) => {
    const key = row.sourceRecordKey || `row:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 공유 시간 예산에서 같은 회사가 매일 뒤로 밀리지 않도록 실행 시작점을 일자별로 회전한다. */
export function rotateGovSyncUnits<T>(units: readonly T[], dayNumber: number): T[] {
  if (!units.length) return [];
  const offset = ((dayNumber % units.length) + units.length) % units.length;
  return [...units.slice(offset), ...units.slice(0, offset)];
}

export function getGovSyncRunStatus(results: readonly Pick<GovAreaTaskResult<unknown>, "status">[]): "success" | "error" {
  return results.length > 0 && results.every((result) => result.status !== "success") ? "error" : "success";
}

export function getGovCollectionOutcome(
  dataset: string,
  areaCodes: readonly string[],
  newRowCount: number,
  results: readonly Pick<GovAreaTaskResult<unknown>, "areaCode" | "status">[]
): { status: "success" | "error"; message: string } {
  const pendingAreas = new Set(results.filter((result) => result.status !== "success").map((result) => result.areaCode));
  const confirmedAreaCount = areaCodes.filter((areaCode) => {
    const areaResults = results.filter((result) => result.areaCode === areaCode);
    return areaResults.length > 0 && areaResults.every((result) => result.status === "success");
  }).length;

  if (newRowCount > 0) {
    return {
      status: "success",
      message: `${dataset} · 지역 ${areaCodes.length}곳 중 ${areaCodes.length - pendingAreas.size}곳 완료 · ${pendingAreas.size}곳 다음 실행`
    };
  }
  if (confirmedAreaCount === areaCodes.length && areaCodes.length > 0 && pendingAreas.size === 0) {
    return { status: "success", message: `새 행 없음(지역 ${areaCodes.length}곳 확인)` };
  }

  const errorCount = results.filter((result) => result.status === "error").length;
  const deferredCount = results.filter((result) => result.status === "deferred").length;
  return {
    status: "error",
    message: `${dataset} 수집 행이 없습니다. 오류 ${errorCount}곳 · 시간 예산 이월 ${deferredCount}곳 · ${pendingAreas.size}곳 다음 실행`
  };
}

export type GovRequestLimiter = <T>(load: () => Promise<T>) => Promise<T>;

/** 여러 회사·데이터셋이 함께 실행돼도 실제 외부 요청은 전체 합계 max개만 진행한다. */
export function createGovRequestLimiter(max: number): GovRequestLimiter {
  const concurrency = Math.max(1, max);
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () => new Promise<void>((resolve) => {
    if (active < concurrency) {
      active += 1;
      resolve();
      return;
    }
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <T>(load: () => Promise<T>) => {
    await acquire();
    try {
      return await load();
    } finally {
      release();
    }
  };
}

/** 최신 1페이지를 우선하며, 시작하지 못한 작업도 결과에 남겨 다음 실행에서 이어갈 수 있게 한다. */
export async function runGovAreaTasks<T>(options: {
  tasks: readonly GovAreaTask[];
  load: (task: GovAreaTask) => Promise<T>;
  concurrency?: number;
  deadlineAt: number;
  requestTimeoutMs?: number;
  now?: () => number;
}): Promise<GovAreaTaskResult<T>[]> {
  const now = options.now || Date.now;
  const concurrency = Math.max(1, options.concurrency || GOV_FANOUT_CONCURRENCY);
  const requestTimeoutMs = options.requestTimeoutMs || GOV_REQUEST_TIMEOUT_MS;
  const results = new Array<GovAreaTaskResult<T>>(options.tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= options.tasks.length) return;
      const task = options.tasks[index];
      const started = now();
      if (started + requestTimeoutMs > options.deadlineAt) {
        results[index] = { ...task, status: "deferred", elapsedMs: 0 };
        continue;
      }
      try {
        const value = await options.load(task);
        results[index] = { ...task, status: "success", elapsedMs: Math.max(0, now() - started), value };
      } catch (error) {
        results[index] = {
          ...task,
          status: error instanceof GovBudgetDeferredError ? "deferred" : "error",
          elapsedMs: Math.max(0, now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, options.tasks.length) }, worker));
  return results;
}

