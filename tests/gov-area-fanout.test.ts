import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildGovAreaTasks,
  dedupeGovRows,
  GOV_COLLECTION_BUDGET_MS,
  GOV_FANOUT_CONCURRENCY,
  GOV_REQUEST_TIMEOUT_MS,
  runGovAreaTasks
} from "../lib/gov-area-fanout";

describe("정부 데이터 지역 fan-out", () => {
  it("운영 제한값을 3개 동시·요청 12초·전체 40초로 고정한다", () => {
    expect(GOV_FANOUT_CONCURRENCY).toBe(3);
    expect(GOV_REQUEST_TIMEOUT_MS).toBe(12_000);
    expect(GOV_COLLECTION_BUDGET_MS).toBe(40_000);
  });

  it("모든 지역 최신 1페이지를 먼저 배치하고 미완료 지역만 커서를 이어간다", () => {
    const tasks = buildGovAreaTasks(["1", "2"], {
      "2": { areaCode: "2", page: 4, cutoff: "old", scanStartedAt: "scan" }
    }, "new", "now");
    expect(tasks.map(({ areaCode, page, kind }) => [areaCode, page, kind])).toEqual([
      ["1", 1, "latest"], ["2", 1, "latest"], ["2", 4, "cursor"]
    ]);
  });

  it("지역 실패를 격리하고 동시 요청은 3개를 넘지 않는다", async () => {
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
    expect(maxActive).toBe(3);
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
});
