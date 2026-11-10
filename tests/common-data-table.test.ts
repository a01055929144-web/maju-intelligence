import { describe, expect, it } from "vitest";
import { COMMON_TABLE_PAGE_SIZES, normalizeColumnState, setColumnWidth } from "../lib/common-data-table";

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
    expect(COMMON_TABLE_PAGE_SIZES.list).toEqual([30, 50, 100]);
    expect(COMMON_TABLE_PAGE_SIZES.order).toEqual([50, 100, 300, 500]);
  });
});
