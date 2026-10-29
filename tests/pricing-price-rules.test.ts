import { describe, expect, it } from "vitest";
import { calculatePrice, needsRecalculation, type PriceItem } from "../domains/pricing/price-rules";
import { priceSheetsEnabled } from "../lib/pricing/feature";
const groups = [{ id: "g", name: "기본", margin: 20, rounding: 10 }];
const item: PriceItem = { id: "p", name: "품목", cost: 800, price: 1000, groupId: "g", appliedCost: 800, appliedMargin: 20, appliedRounding: 10, active: true, directPrice: null };
describe("pricing P0 boundaries", () => {
  it("defaults off and requires explicit activation", () => {
    expect(priceSheetsEnabled("")).toBe(false); expect(priceSheetsEnabled("false")).toBe(false); expect(priceSheetsEnabled("true")).toBe(true);
  });
  it("uses gross margin and rounds upward", () => {
    expect(calculatePrice(800, 20)).toBe(1000); expect(calculatePrice(801, 20)).toBe(1010);
    expect(calculatePrice(0, 99.99)).toBe(0); expect(calculatePrice(1, 99.99, 1)).toBe(10000);
    expect(calculatePrice(1e12, 0, 1)).toBe(1e12);
    expect(calculatePrice(999999999999.98, 0, 1)).toBe(1e12);
    expect(() => calculatePrice(0.001, 0, 1)).toThrow();
  });
  it("honors direct prices including zero ahead of margin", () => {
    expect(calculatePrice(100, 20, 10, 0)).toBe(0); expect(calculatePrice(100, 20, 10, 999)).toBe(999);
    expect(() => calculatePrice(100, 20, 10, 1.5)).toThrow();
  });
  it.each([NaN, Infinity, -1, 1e13])("rejects invalid cost %s", cost => expect(() => calculatePrice(cost, 20)).toThrow());
  it.each([NaN, Infinity, -1, 100])("rejects invalid margin %s", margin => expect(() => calculatePrice(10, margin)).toThrow());
  it("rejects overflow and invalid rounding", () => { expect(() => calculatePrice(1e12, 99.99)).toThrow(); expect(() => calculatePrice(1, 20, 0)).toThrow(); });
  it("tracks cost and group changes; excludes fixed/inactive/zero", () => {
    expect(needsRecalculation(item, groups)).toBe(false);
    expect(needsRecalculation({ ...item, cost: 900 }, groups)).toBe(true);
    expect(needsRecalculation(item, [{ ...groups[0], margin: 21 }])).toBe(true);
    for (const change of [{ active: false }, { cost: 0 }, { groupId: null }, { directPrice: 0 }]) expect(needsRecalculation({ ...item, cost: 900, ...change }, groups)).toBe(false);
    expect(needsRecalculation({ ...item, appliedCost: null }, groups)).toBe(true);
  });
});
