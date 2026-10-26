import { describe, expect, it } from "vitest";
import {
  canScanNextGovArea,
  getGovAreaCodes,
  getGovAreaCoverageStatus,
  getGovChangeCutoff,
  getGovUpdateKind,
  GOV_SYNC_PAGES_PER_REQUEST,
  govLastSuccessRunQuery,
  resolveGovAreaScanWindow,
  scanGovArea
} from "../lib/gov-area-scan";

describe("지역 조건 정부 수집", () => {
  it("기존 리드의 시군구 코드와 일반구·시 전체 선택을 같은 코드로 연결한다", () => {
    expect(getGovAreaCodes(["서울특별시 강남구"]).codes).toEqual(["3220000"]);
    expect(getGovAreaCodes(["경기도 성남시 분당구", "경기도 성남시"]).codes).toEqual(["3780000"]);
    expect(getGovAreaCodes(["인천광역시 중구"])).toEqual({
      codes: ["3490000"],
      missing: [],
    });
  });

  it("완전성을 검증하지 못한 시·도 전체 선택은 부분 조회를 시작하지 않도록 오류로 돌린다", () => {
    const result = getGovAreaCodes(["인천광역시"]);
    expect(result).toEqual({
      codes: [],
      missing: ["인천광역시"],
    });
    expect(getGovAreaCoverageStatus(result.missing)).toBe("error");
  });

  it("저장 커서 지역이 현재 영업 지역에서 빠졌으면 새 스캔 시각과 cutoff로 초기화한다", () => {
    const result = resolveGovAreaScanWindow({
      codes: ["3490000"],
      savedCursor: {
        areaCode: "3220000",
        page: 7,
        cutoff: "2026-10-01T00:00:00.000Z",
        scanStartedAt: "2026-10-02T00:00:00.000Z",
      },
      startedAt: "2026-10-27T00:00:00.000Z",
      previousFinishedAt: "2026-10-26T00:00:00.000Z",
      lookbackDays: 14,
    });

    expect(result.cursor).toBeUndefined();
    expect(result.startIndex).toBe(0);
    expect(result.scanStartedAt).toBe("2026-10-27T00:00:00.000Z");
    expect(result.cutoff.toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("마지막 성공 시각 하루 전부터 보되 14일보다 과거로 가지 않는다", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    expect(getGovChangeCutoff(now, "2026-10-26T00:00:00Z").toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(getGovChangeCutoff(now, "2026-09-01T00:00:00Z").toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("최근 두 번이 실패했어도 마지막 성공 실행의 커서를 조회한다", () => {
    const query = govLastSuccessRunQuery("company-1");
    expect(query).toContain("status=eq.success");
    expect(query).toContain("order=started_at.desc&limit=1");
  });

  it("페이지 한도에 도달하면 다음 지역의 첫 페이지를 호출하지 않는다", () => {
    expect(canScanNextGovArea(13, 14)).toBe(true);
    expect(canScanNextGovArea(14, 14)).toBe(false);
  });

  it("첫 페이지의 최신 행을 받고 두 번째 페이지의 오래된 행에서 멈춘다", async () => {
    const pages: number[] = [];
    const result = await scanGovArea({
      maxPages: 10,
      pageSize: 2,
      cutoff: new Date("2026-10-20T00:00:00Z"),
      modifiedAt: (row: { at: string }) => row.at,
      load: async (page) => {
        pages.push(page);
        return { totalCount: 6, rows: page === 1
          ? [{ at: "2026-10-24 22:47" }, { at: "2026-10-23 08:00" }]
          : [{ at: "2026-10-18 08:00" }, { at: "2026-10-17 08:00" }] };
      }
    });
    expect(pages).toEqual([1, 2]);
    expect(result.rows).toHaveLength(2);
    expect(result.nextPage).toBeNull();
    expect(result.reachedCutoff).toBe(true);
  });

  it("첫 적재 페이지를 다음 실행에서 이어받는다", async () => {
    const pages: number[] = [];
    const options = {
      maxPages: 2,
      pageSize: 1,
      modifiedAt: (row: { id: number }) => String(row.id),
      load: async (page: number) => {
        pages.push(page);
        return { totalCount: 4, rows: [{ id: page }] };
      }
    };
    const first = await scanGovArea(options);
    const second = await scanGovArea({ ...options, startPage: first.nextPage || 1 });
    expect(first.nextPage).toBe(3);
    expect(second.nextPage).toBeNull();
    expect(pages).toEqual([1, 2, 3, 4]);
  });

  it("함수 시간 예산을 위해 한 번에 한 페이지만 읽고 다음 페이지 커서를 남긴다", async () => {
    const pages: number[] = [];
    const result = await scanGovArea({
      maxPages: GOV_SYNC_PAGES_PER_REQUEST,
      pageSize: 1,
      modifiedAt: () => "2026-10-27 00:00",
      load: async (page) => {
        pages.push(page);
        return { totalCount: 3, rows: [{ id: page }] };
      },
    });

    expect(pages).toEqual([1]);
    expect(result.nextPage).toBe(2);
  });

  it("I/U/D 변경 유형을 구별한다", () => {
    expect(["I", "U", "D", "?"].map(getGovUpdateKind)).toEqual(["insert", "update", "delete", "unknown"]);
  });
});
