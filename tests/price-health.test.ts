import { describe, expect, it } from "vitest";
import { isLoss, isLowProfit, LOW_PROFIT_RATIO, marginPercent, splitHidden } from "../domains/pricing/price-health";

describe("price health rules", () => {
  it("treats zero or negative profit as a loss (boundary 0 won)", () => {
    expect(isLoss({ price: 1000, cost: 1000 })).toBe(true);
    expect(isLoss({ price: 900, cost: 1000 })).toBe(true);
    expect(isLoss({ price: 1001, cost: 1000 })).toBe(false);
  });
  it("flags low profit below half of the default margin, not at the boundary", () => {
    expect(LOW_PROFIT_RATIO).toBe(0.5);
    // 기본 마진 20% → 10% 미만이 이익 낮음
    expect(isLowProfit({ price: 1099, cost: 1000 }, 20)).toBe(true);
    expect(isLowProfit({ price: 1100, cost: 1000 }, 20)).toBe(false);
    expect(isLowProfit({ price: 1000, cost: 1000 }, 20)).toBe(false); // 손해는 따로 센다
    expect(isLowProfit({ price: 1001, cost: 1000 }, 0)).toBe(false);
  });
  it("margin percent needs a positive cost", () => {
    expect(marginPercent({ price: 1200, cost: 1000 })).toBe(20);
    expect(marginPercent({ price: 1200, cost: 0 })).toBeNull();
  });
  it("splits hidden products out of the default list", () => {
    const { visible, hidden } = splitHidden([{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }]);
    expect(visible.map((x) => x.id)).toEqual([1, 3]);
    expect(hidden.map((x) => x.id)).toEqual([2]);
  });
});
