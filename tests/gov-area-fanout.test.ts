import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildGovAreaTasks,
  createGovRequestLimiter,
  dedupeGovRows,
  getGovSyncRunStatus,
  GOV_COLLECTION_BUDGET_MS,
  GOV_FANOUT_CONCURRENCY,
  GOV_POSTPROCESS_RESERVE_MS,
  GOV_REQUEST_TIMEOUT_MS,
  GovBudgetDeferredError,
  isGovSyncStale,
  isGovTimeoutError,
  loadGovAreaWithTimeoutRetry,
  prioritizeGovAreaCodes,
  rotateGovSyncUnits,
  runGovAreaTasks
} from "../lib/gov-area-fanout";

describe("정부 데이터 지역 fan-out", () => {
  it("운영 제한값을 2개 동시·요청 20초·전체 40초(함수 60초 한도 안)로 고정한다", () => {
    expect(GOV_FANOUT_CONCURRENCY).toBe(2);
    expect(GOV_REQUEST_TIMEOUT_MS).toBe(20_000);
    expect(GOV_COLLECTION_BUDGET_MS).toBe(40_000);
    expect(GOV_POSTPROCESS_RESERVE_MS).toBe(10_000);
  });

  it("모든 지역 최신 1페이지를 먼저 배치하고 미완료 지역만 커서를 이어간다", () => {
    const tasks = buildGovAreaTasks(["1", "2"], {
      "2": { areaCode: "2", page: 4, cutoff: "old", scanStartedAt: "scan" }
    }, "new", "now");
    expect(tasks.map(({ areaCode, page, kind }) => [areaCode, page, kind])).toEqual([
      ["1", 1, "latest"], ["2", 1, "latest"], ["2", 4, "cursor"]
    ]);
  });

  it("지역 실패를 격리하고 동시 요청은 2개를 넘지 않는다", async () => {
    let active = 0;
    let maxActive = 0;
    const tasks = buildGovAreaTasks(["1", "2", "3", "4"], {}, "cutoff", "scan");
    const results = await runGovAreaTasks({
      tasks,
      deadlineAt: Date.now() + GOV_COLLECTION_BUDGET_MS,
      load: async (task) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        if (task.areaCode === "2") throw new Error("지역 오류");
        return task.areaCode;
      }
    });
    expect(maxActive).toBe(2);
    expect(results.map((result) => result.status)).toEqual(["success", "error", "success", "success"]);
  });

  it("남은 시간이 요청 timeout보다 짧으면 호출하지 않고 deferred로 남긴다", async () => {
    const load = vi.fn();
    const [result] = await runGovAreaTasks({
      tasks: buildGovAreaTasks(["1"], {}, "cutoff", "scan"),
      deadlineAt: 11_999,
      now: () => 0,
      load
    });
    expect(result.status).toBe("deferred");
    expect(load).not.toHaveBeenCalled();
  });

  it("공통 큐 대기 중 요청 예산이 소진돼도 error가 아니라 deferred로 이월한다", async () => {
    const [result] = await runGovAreaTasks({
      tasks: buildGovAreaTasks(["1"], {}, "cutoff", "scan"),
      deadlineAt: Date.now() + GOV_REQUEST_TIMEOUT_MS + 100,
      load: async () => { throw new GovBudgetDeferredError(); }
    });
    expect(result.status).toBe("deferred");
  });

  it("같은 최신 1페이지를 재처리해도 source key별 한 행만 ingest 대상으로 남긴다", () => {
    expect(dedupeGovRows([
      { sourceRecordKey: "same", value: 1 },
      { sourceRecordKey: "same", value: 1 },
      { sourceRecordKey: "other", value: 2 }
    ])).toEqual([
      { sourceRecordKey: "same", value: 1 },
      { sourceRecordKey: "other", value: 2 }
    ]);
  });

  it("일반음식점은 기존 cron, 휴게·제과는 recommend-refresh에 연결한다", () => {
    const business = readFileSync("app/api/cron/business-status/route.ts", "utf8");
    const recommend = readFileSync("app/api/cron/recommend-refresh/route.ts", "utf8");
    expect(business).toContain("syncAllCompaniesGovRestaurantLeads()");
    expect(recommend).toContain('syncAllCompaniesGovRestaurantLeads(["rest_cafes", "bakeries"])');
  });

  it("공유 예산 실행 순서를 날짜별로 회전해 같은 회사가 계속 후순위가 되지 않게 한다", () => {
    const units = ["회사A-휴게", "회사B-휴게", "회사A-제과", "회사B-제과"];
    expect(rotateGovSyncUnits(units, 0)).toEqual(units);
    expect(rotateGovSyncUnits(units, 1)).toEqual(["회사B-휴게", "회사A-제과", "회사B-제과", "회사A-휴게"]);
    expect(rotateGovSyncUnits(units, 2)[0]).toBe("회사A-제과");
  });

  it("모든 지역이 error 또는 deferred이면 성공 상태를 남기지 않는다", () => {
    expect(getGovSyncRunStatus([{ status: "error" }, { status: "deferred" }])).toBe("error");
    expect(getGovSyncRunStatus([{ status: "error" }, { status: "success" }])).toBe("success");
  });

  it("여러 회사 큐가 동시에 제출해도 전체 외부 요청은 2개를 넘지 않는다", async () => {
    const limit = createGovRequestLimiter(2);
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    let releaseFirstWave = () => {};
    const firstWave = new Promise<void>((resolve) => { releaseFirstWave = resolve; });
    const jobs = ["회사A", "회사B", "회사C", "회사D"].map((company) => limit(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      started.push(company);
      if (started.length <= 2) await firstWave;
      active -= 1;
    }));
    await vi.waitFor(() => expect(started).toHaveLength(2));
    releaseFirstWave();
    await Promise.all(jobs);
    expect(maxActive).toBe(2);
    expect(started).toEqual(["회사A", "회사B", "회사C", "회사D"]);
  });

  it("부분 실패의 남은 지역을 앞에 두되 같은 지역이 연속 첫 순서가 되지 않게 회전한다", () => {
    expect(prioritizeGovAreaCodes(["1", "2", "3", "4"], ["3", "2"], "3")).toEqual(["2", "3", "1", "4"]);
    expect(prioritizeGovAreaCodes(["1", "2", "3"], ["3"], "3")).toEqual(["1", "3", "2"]);
  });

  it("시간 초과와 마지막 성공 36시간 경과를 판정한다", () => {
    expect(isGovTimeoutError("The operation was aborted due to timeout")).toBe(true);
    expect(isGovTimeoutError("HTTP 500")).toBe(false);
    const now = Date.parse("2026-11-16T18:00:00Z");
    expect(isGovSyncStale("2026-11-15T06:00:01Z", now)).toBe(false);
    expect(isGovSyncStale("2026-11-15T05:59:59Z", now)).toBe(true);
    expect(isGovSyncStale(null, now)).toBe(true);
  });

  it("25초 시간 초과는 작은 50행으로 한 번만 재시도하고 다른 지역 수집은 계속한다", async () => {
    const calls: Array<[string, number]> = [];
    const tasks = buildGovAreaTasks(["slow", "fast"], {}, "cutoff", "scan");
    const results = await runGovAreaTasks({
      tasks,
      concurrency: 2,
      deadlineAt: Date.now() + 60_000,
      load: (task) => loadGovAreaWithTimeoutRetry(async (pageSize) => {
        calls.push([task.areaCode, pageSize]);
        if (task.areaCode === "slow") throw new Error("The operation was aborted due to timeout");
        return task.areaCode;
      })
    });

    expect(calls).toEqual(expect.arrayContaining([["slow", 100], ["slow", 50], ["fast", 100]]));
    expect(results.map((result) => result.status)).toEqual(["error", "success"]);
  });

  it("30초 지연 지역이 있어도 다른 지역 결과를 보존하고 지연 지역만 한 번 재시도한다", async () => {
    vi.useFakeTimers();
    try {
      const calls: Array<[string, number]> = [];
      const resultsPromise = runGovAreaTasks({
        tasks: buildGovAreaTasks(["slow", "fast"], {}, "cutoff", "scan"),
        concurrency: 2,
        deadlineAt: Date.now() + 240_000,
        load: (task) => loadGovAreaWithTimeoutRetry((pageSize) => {
          calls.push([task.areaCode, pageSize]);
          if (task.areaCode === "fast") return Promise.resolve("collected");
          return new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error("timeout after 30 seconds")), 30_000);
          });
        })
      });

      await vi.advanceTimersByTimeAsync(60_000);
      const results = await resultsPromise;

      expect(calls).toEqual(expect.arrayContaining([["fast", 100], ["slow", 100], ["slow", 50]]));
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ areaCode: "fast", status: "success", value: "collected" }),
        expect.objectContaining({ areaCode: "slow", status: "error" })
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("세 번째 연속 시간 초과 지역은 20행 단독 재시도 크기를 쓴다", async () => {
    const sizes: number[] = [];
    await expect(loadGovAreaWithTimeoutRetry(async (pageSize) => {
      sizes.push(pageSize);
      throw new Error("timeout");
    }, 2)).rejects.toThrow("timeout");
    expect(sizes).toEqual([20, 20]);
  });
});
