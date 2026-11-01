import { describe, expect, it } from "vitest";
import { convertToSalesUnit, median } from "../domains/inventory/unit-conversion";

describe("unit conversion", () => {
  it("uses the median for odd and even observation counts", () => {
    expect(median([9.3, 9.5, 9.6])).toBe(9.5);
    expect(median([9, 10, 11, 12])).toBe(10.5);
  });

  it("uses the fixed conversion when no observation exists", () => {
    expect(median([], 9.5)).toBe(9.5);
  });

  it("converts purchase quantity into the sale and inventory unit", () => {
    expect(convertToSalesUnit(2, 9.5)).toBe(19);
    expect(convertToSalesUnit(500, 0.001)).toBe(0.5);
    expect(() => convertToSalesUnit(1, 0)).toThrow(RangeError);
  });
});
