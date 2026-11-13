import { describe, expect, it } from "vitest";
import { averageDeltaPercent } from "../domains/pricing/margin-template";

describe("averageDeltaPercent", () => {
  const template = { margin: 20, rounding: 1, categories: [{ category: "채소", margin: 30 }], items: [] };
  it("averages category and default margins against the base price", () => {
    const base = [{ id: "a", category: "채소", cost: 1000, price: 1100 }, { id: "b", category: "공산품", cost: 1000, price: 1200 }];
    expect(averageDeltaPercent(template, base)).toBe(9.1); // 채소 1300/1100 +18.2%, 공산품 1200/1200 0%
  });
  it("returns null when nothing is comparable", () => {
    expect(averageDeltaPercent(template, [{ id: "a", category: "채소", cost: 1000, price: 0 }])).toBeNull();
  });
});
