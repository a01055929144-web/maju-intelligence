import { describe, expect, it } from "vitest";
import {
  A2_GANGNAM_DRY_RUN_DATASETS,
  buildGangnamDryRunRequest,
  estimateGovFoodDryRun,
  getSafeRowBudget,
  nextGovFoodDryRunCursor
} from "../lib/public-data/gov-food-dry-run-plan";

describe("A2 강남구 전체 매장 DB 드라이런 계획", () => {
  it("추가 4종을 강남구·영업 중·쓰기 0으로 고정한다", () => {
    expect(A2_GANGNAM_DRY_RUN_DATASETS).toEqual([
      "rest_cafes",
      "bakeries",
      "group_meal_facilities",
      "contract_catering"
    ]);
    expect(buildGangnamDryRunRequest("rest_cafes")).toMatchObject({
      areaCode: "3220000",
      statusCode: "01",
      page: 1,
      pageSize: 100,
      activeOnly: true,
      writeEnabled: false
    });
  });

  it("측정된 영업 중 건수로 페이지·호출·예상 용량을 계산한다", () => {
    const result = estimateGovFoodDryRun([
      { dataset: "rest_cafes", activeTotalCount: 201 },
      { dataset: "bakeries", activeTotalCount: 0 }
    ]);
    expect(result).toEqual({
      datasets: [
        { dataset: "rest_cafes", rows: 201, pages: 2, estimatedBytes: 174_870 },
        { dataset: "bakeries", rows: 0, pages: 1, estimatedBytes: 0 }
      ],
      rows: 201,
      calls: 3,
      estimatedBytes: 174_870
    });
  });

  it("마지막 페이지 다음에는 다음 데이터셋 1페이지로 이동하고 끝에서는 종료한다", () => {
    const pages = { rest_cafes: 2, bakeries: 1 } as const;
    const datasets = ["rest_cafes", "bakeries"] as const;
    expect(nextGovFoodDryRunCursor({ dataset: "rest_cafes", page: 1 }, pages, datasets))
      .toEqual({ dataset: "rest_cafes", page: 2 });
    expect(nextGovFoodDryRunCursor({ dataset: "rest_cafes", page: 2 }, pages, datasets))
      .toEqual({ dataset: "bakeries", page: 1 });
    expect(nextGovFoodDryRunCursor({ dataset: "bakeries", page: 1 }, pages, datasets)).toBeNull();
  });

  it("104MB에서 400MB 중단선까지 870바이트 행 예산을 계산한다", () => {
    expect(getSafeRowBudget({ currentDatabaseMb: 104, stopAtMb: 400 })).toBe(340_229);
  });
});
