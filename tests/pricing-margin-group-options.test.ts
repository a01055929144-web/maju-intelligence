import { expect, it } from "vitest";
import type { PriceItem, PriceState } from "../domains/pricing/price-rules";
import { filterMarginCategories, marginCategoryOptions, marginGroupSummary, marginSource } from "../components/pricing-margin-group-options";
const category = "농산 > 채소류 > 조미채소";
const item = (id: string, patch: Partial<PriceItem> = {}): PriceItem => ({ id, name: "합성", category, groupId: null, itemMargin: null, cost: 100, price: 120, appliedCost: 100, appliedMargin: 20, appliedRounding: 10, active: true, directPrice: null, ...patch });
const state: PriceState = { groups: [{ id: "one", name: "같은 이름", margin: 12, rounding: 10 }, { id: "two", name: "같은 이름", margin: 15, rounding: 10 }], categories: [{ category: "기존 자체 분류", groupId: "one" }], items: [], defaultMargin: 10, defaultRounding: 10, total: 0, page: 1, pageSize: 50, pendingCount: 0, lastBatch: null, restored: false };
it("reads actual active paths and preserves existing zero-product/custom category links", () => {
  const options = marginCategoryOptions([item("a"), item("b"), item("c", { active: false }), item("d", { category: "우리 회사 > 특수품목" }), item("e", { category: "" })], state.categories);
  expect(options.find(option => option.path === category)?.count).toBe(2);
  expect(options.find(option => option.path === "기존 자체 분류")?.count).toBe(0);
  expect(options.some(option => option.path === "우리 회사 > 특수품목")).toBe(true);
  expect(options.some(option => option.path === "농산")).toBe(false);
  expect(marginCategoryOptions([item("raw", { category: " 농산 " })], [])[0]).toMatchObject({ path: " 농산 ", selectable: false });
});
it("filters real large/middle/small paths and supports multiple search terms without changing selections", () => {
  const options = marginCategoryOptions([item("a"), item("b", { category: "축산 > 돈육 > 삼겹·오겹" })], state.categories);
  expect(filterMarginCategories(options, "농산 조미", ["농산", "채소류", "조미채소"]).map(option => option.path)).toEqual([category]);
  expect(filterMarginCategories(options, "조미", ["축산", "", ""])).toEqual([]);
  expect(options.some(option => option.path === "기존 자체 분류")).toBe(true);
});
it("counts exact-category targets separately from effective group pricing, preserving zero overrides and product assignments", () => {
  const items = [item("normal"), item("direct", { directPrice: 0 }), item("individual", { itemMargin: 0 }), item("other", { groupId: "two" }), item("explicit", { category: "다른 분류", groupId: "one" }), item("inactive", { active: false }), item("child", { category: `${category} > 하위` })];
  const original = JSON.stringify({ state, items });
  expect(marginGroupSummary(state, items, "one", [category])).toEqual({ categoryProducts: 4, groupProducts: 2, explicitProducts: 1 });
  expect(marginGroupSummary(state, items, "", [category])).toEqual({ categoryProducts: 4, groupProducts: 1, explicitProducts: 0 });
  expect(marginGroupSummary(state, items, "one", ["농산"])).toEqual({ categoryProducts: 0, groupProducts: 1, explicitProducts: 1 });
  expect(marginSource(items[1], state).kind).toBe("direct"); expect(marginSource(items[2], state).margin).toBe(0);
  expect(JSON.stringify({ state, items })).toBe(original);
});
