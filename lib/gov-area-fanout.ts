import type { GovAreaCursor } from "./gov-area-scan";

export const GOV_FANOUT_CONCURRENCY = 3;
export const GOV_REQUEST_TIMEOUT_MS = 12_000;
export const GOV_COLLECTION_BUDGET_MS = 40_000;

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
          status: "error",
          elapsedMs: Math.max(0, now() - started),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, options.tasks.length) }, worker));
  return results;
}

