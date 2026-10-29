import { describe, expect, it } from "vitest";
import { calculatePrice, calculateItemPrice, resolvePriceRule, needsRecalculation, type PriceItem } from "../domains/pricing/price-rules";
import { priceSheetsEnabled } from "../lib/pricing/feature";
const groups = [{ id: "g", name: "기본", margin: 20, rounding: 10 }];
const item: PriceItem = { id: "p", name: "품목", category: "채소", itemMargin: null, cost: 800, price: 1000, groupId: "g", appliedCost: 800, appliedMargin: 20, appliedRounding: 10, active: true, directPrice: null };
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
    for (const change of [{ active: false }, { cost: 0 }, { directPrice: 0 }]) expect(needsRecalculation({ ...item, cost: 900, ...change }, groups)).toBe(false);
    expect(needsRecalculation({ ...item, appliedCost: null }, groups)).toBe(true);
  });
});

describe("pricing priority and category inheritance", () => {
  const categories = [{ category: "채소", groupId: "g" }];
  const inherited = { ...item, groupId: null };
  it("resolves category group before default and rounds after margin selection", () => {
    expect(calculateItemPrice(inherited, groups, categories, 10)).toBe(1000);
    expect(calculateItemPrice(inherited, [], [], 10, 100)).toBe(900);
    expect(resolvePriceRule(inherited, groups, categories, 10).source).toBe("group");
    expect(resolvePriceRule(inherited, [], [], 10).source).toBe("default");
  });
  it("uses item margin including zero before group and default", () => {
    expect(calculateItemPrice({ ...inherited, itemMargin: 0 }, groups, categories, 10)).toBe(800);
    expect(calculateItemPrice({ ...inherited, itemMargin: 50 }, groups, categories, 10)).toBe(1600);
    expect(calculateItemPrice({ ...inherited, itemMargin: 50, directPrice: 801 }, groups, categories, 10, 100)).toBe(801);
    expect(calculateItemPrice({ ...inherited, itemMargin: 50, directPrice: 0 }, groups, categories, 10)).toBe(0);
  });
  it("counts missing groups against the default and ignores shadowed default changes", () => {
    expect(needsRecalculation(inherited, groups, categories, 10)).toBe(false);
    expect(needsRecalculation(inherited, groups, categories, 30)).toBe(false);
    expect(needsRecalculation(inherited, groups, [], 10)).toBe(true);
    expect(needsRecalculation(inherited, [], [], 20)).toBe(false);
    expect(needsRecalculation({ ...inherited, itemMargin: 0 }, groups, categories, 20)).toBe(true);
  });
});
