import { describe, expect, it } from "vitest";
import { gridTsv, moveGridCell, nextEditableCell, rangeKeys } from "../lib/common-data-table";

const size = { rows: 5, cols: 4 };

describe("grid cell movement (CC-44a)", () => {
  it("arrows move one cell and stop at the edges", () => {
    expect(moveGridCell({ row: 2, col: 1 }, "ArrowDown", size).cell).toEqual({ row: 3, col: 1 });
    expect(moveGridCell({ row: 0, col: 0 }, "ArrowUp", size).cell).toEqual({ row: 0, col: 0 });
    expect(moveGridCell({ row: 4, col: 3 }, "ArrowRight", size).cell).toEqual({ row: 4, col: 3 });
    expect(moveGridCell({ row: 1, col: 0 }, "ArrowLeft", size).cell).toEqual({ row: 1, col: 0 });
  });
  it("Home/End go to row ends, Ctrl+Home/End to the table corners", () => {
    expect(moveGridCell({ row: 2, col: 2 }, "Home", size).cell).toEqual({ row: 2, col: 0 });
    expect(moveGridCell({ row: 2, col: 2 }, "End", size).cell).toEqual({ row: 2, col: 3 });
    expect(moveGridCell({ row: 2, col: 2 }, "Home", size, { ctrl: true }).cell).toEqual({ row: 0, col: 0 });
    expect(moveGridCell({ row: 2, col: 2 }, "End", size, { ctrl: true }).cell).toEqual({ row: 4, col: 3 });
  });
  it("PageDown/PageUp jump a screen and report overflow at the last/first row", () => {
    expect(moveGridCell({ row: 0, col: 1 }, "PageDown", size, { pageStep: 3 }).cell).toEqual({ row: 3, col: 1 });
    expect(moveGridCell({ row: 3, col: 1 }, "PageDown", size, { pageStep: 3 }).cell).toEqual({ row: 4, col: 1 });
    expect(moveGridCell({ row: 4, col: 1 }, "PageDown", size)).toEqual({ cell: { row: 4, col: 1 }, overflow: "next" });
    expect(moveGridCell({ row: 0, col: 1 }, "PageUp", size)).toEqual({ cell: { row: 0, col: 1 }, overflow: "prev" });
  });
  it("an empty table does not move", () => {
    expect(moveGridCell({ row: 0, col: 0 }, "ArrowDown", { rows: 0, cols: 3 }).cell).toEqual({ row: 0, col: 0 });
  });
});

describe("Tab between editable cells", () => {
  const editable = (cell: { row: number; col: number }) => cell.col === 1 || cell.col === 3;
  it("goes right then wraps to the next row's first editable cell", () => {
    expect(nextEditableCell({ row: 0, col: 1 }, false, size, editable)).toEqual({ row: 0, col: 3 });
    expect(nextEditableCell({ row: 0, col: 3 }, false, size, editable)).toEqual({ row: 1, col: 1 });
  });
  it("Shift+Tab goes back, and returns null past the ends", () => {
    expect(nextEditableCell({ row: 1, col: 1 }, true, size, editable)).toEqual({ row: 0, col: 3 });
    expect(nextEditableCell({ row: 0, col: 1 }, true, size, editable)).toBeNull();
    expect(nextEditableCell({ row: 4, col: 3 }, false, size, editable)).toBeNull();
  });
});

describe("range selection and copy", () => {
  it("selects rows between the anchor and target in either direction", () => {
    const keys = ["a", "b", "c", "d", "e"];
    expect(rangeKeys(keys, 1, 3)).toEqual(["b", "c", "d"]);
    expect(rangeKeys(keys, 3, 1)).toEqual(["b", "c", "d"]);
    expect(rangeKeys(keys, 2, 2)).toEqual(["c"]);
    expect(rangeKeys([], 0, 3)).toEqual([]);
  });
  it("builds tab-separated text with tabs and newlines inside cells flattened", () => {
    expect(gridTsv([[1, "상품 A", 6980], [2, "상품\tB\n", null]])).toBe("1\t상품 A\t6980\n2\t상품 B \t");
  });
});
