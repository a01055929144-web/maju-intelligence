import { describe, expect, it } from "vitest";
import { estimateFuelCostWon } from "../lib/opinet";

describe("estimateFuelCostWon", () => {
  it("calculates fuel cost from distance, fuel price, and mileage", () => {
    expect(estimateFuelCostWon(75, 1650, 7.5)).toBe(16500);
  });

  it("returns zero for invalid distance or mileage", () => {
    expect(estimateFuelCostWon(0, 1650, 7.5)).toBe(0);
    expect(estimateFuelCostWon(75, 1650, 0)).toBe(0);
  });
});
