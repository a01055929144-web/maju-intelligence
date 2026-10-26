import type { GovAreaCursor } from "./gov-area-scan";

export const GOV_FANOUT_CONCURRENCY = 3;
export const GOV_REQUEST_TIMEOUT_MS = 12_000;
export const GOV_COLLECTION_BUDGET_MS = 40_000;
export const GOV_POSTPROCESS_RESERVE_MS = 10_000;

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

