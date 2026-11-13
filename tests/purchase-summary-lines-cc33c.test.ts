import { describe, expect, it } from "vitest";
import { flagSummaryLines } from "../domains/pricing/purchase-excluded-codes";

const line = (rowNumber: number, name: string, rawCost: number) => ({ rowNumber, name, rawCost });

describe("flagSummaryLines (CC-33c)", () => {
  it("flags month-total rows by name and by an outlandish unit price, but not normal rows", () => {
    const rows = [line(2, "양파 1kg", 1500), line(3, "대파 1단", 2000), line(4, "2026/10 계", 28_223_618), line(5, "채소 합계", 9000), line(6, "2026-10-01 매입", 100), line(7, "감자 3kg", 4500), line(8, "마늘 소계", 300)];
    expect(flagSummaryLines(rows)).toEqual([4, 5, 6, 8]);
  });
  it("flags only price outliers when names look normal (>100x median)", () => {
    expect(flagSummaryLines([line(2, "A", 1000), line(3, "B", 1200), line(4, "C", 1100), line(5, "D", 500_000)])).toEqual([5]);
  });
  it("does not flag when there are no suspicious rows or no lines", () => {
    expect(flagSummaryLines([line(2, "양파", 1000), line(3, "대파", 1100)])).toEqual([]);
    expect(flagSummaryLines([])).toEqual([]);
  });
});
