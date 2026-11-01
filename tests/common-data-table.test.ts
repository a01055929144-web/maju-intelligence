import { describe, expect, it } from "vitest";
import { COMMON_TABLE_PAGE_SIZES, normalizeColumnState } from "../lib/common-data-table";

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

  it("uses the WO-01 list and order page sizes", () => {
    expect(COMMON_TABLE_PAGE_SIZES.list).toEqual([30, 50, 100]);
    expect(COMMON_TABLE_PAGE_SIZES.order).toEqual([50, 100, 300, 500]);
  });
});
