import { describe, expect, it } from "vitest";
import { autoHiddenKeys, COMMON_TABLE_PAGE_SIZES, normalizeColumnState, pickPageSize, setColumnWidth, visibleRange } from "../lib/common-data-table";

const columns = [
  { key: "code", label: "코드", value: (row: { code: string }) => row.code },
  { key: "name", label: "이름", value: (row: { name: string }) => row.name, defaultHidden: true },
];

describe("common data table contract", () => {
  it("keeps saved order and appends new columns with safe defaults", () => {
    expect(normalizeColumnState(columns, [{ key: "name", hidden: false, pinned: true }])).toEqual([
      { key: "name", hidden: false, pinned: true },
      { key: "code", hidden: false, pinned: false },
    ]);
  });

  it("saves a column width within limits and drops broken saved widths", () => {
    const base = normalizeColumnState(columns);
    expect(setColumnWidth(base, "code", 5000)[0].width).toBe(640);
    expect(setColumnWidth(base, "code", 10)[0].width).toBe(80);
    expect(setColumnWidth(base, "code", 200.4)[1].width).toBeUndefined();
    const saved = [{ key: "code", hidden: false, pinned: false, width: Number.NaN }, { key: "name", hidden: false, pinned: false, width: 222 }];
    expect(normalizeColumnState(columns, saved).map((item) => item.width)).toEqual([undefined, 222]);
  });

  it("reset to defaults carries no widths", () => {
    expect(normalizeColumnState(columns).every((item) => item.width === undefined)).toBe(true);
  });

  it("uses the WO-01 list and order page sizes", () => {
    expect(COMMON_TABLE_PAGE_SIZES.list).toEqual([100, 500, 1000, 0]); // 0 = 전체
    expect(COMMON_TABLE_PAGE_SIZES.order).toEqual([50, 100, 300, 500]);
  });
  it("picks the saved page size only when allowed", () => {
    expect(pickPageSize(COMMON_TABLE_PAGE_SIZES.list, 500)).toBe(500);
    expect(pickPageSize(COMMON_TABLE_PAGE_SIZES.list, 0)).toBe(0);
    expect(pickPageSize(COMMON_TABLE_PAGE_SIZES.list, 77)).toBe(100);
    expect(pickPageSize(COMMON_TABLE_PAGE_SIZES.list, "x")).toBe(100);
  });
  it("hides least-important columns first and never the ones without priority", () => {
    const cols = [{ key: "name", need: 200 }, { key: "a", need: 100, priority: 1 }, { key: "b", need: 100, priority: 3 }, { key: "c", need: 100, priority: 3 }];
    expect(autoHiddenKeys(cols, 600)).toEqual([]);
    expect(autoHiddenKeys(cols, 450)).toEqual(["c"]);
    expect(autoHiddenKeys(cols, 350)).toEqual(["c", "b"]);
    expect(autoHiddenKeys(cols, 50)).toEqual(["c", "b", "a"]);
  });
  it("computes the visible row window with overscan", () => {
    expect(visibleRange(1000, 40, 0, 800, 0)).toEqual({ start: 0, end: 20 });
    expect(visibleRange(1000, 40, 4000, 800, 5)).toEqual({ start: 95, end: 125 });
    expect(visibleRange(10, 40, 9999, 800, 12)).toEqual({ start: 10, end: 10 });
  });
});
