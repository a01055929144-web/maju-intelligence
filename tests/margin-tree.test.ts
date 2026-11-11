import { describe, expect, it } from "vitest";
import { buildMarginTree, effectiveMargin, inFolder, rawPathsInFolder } from "../domains/pricing/margin-tree";
import type { PriceItem, PriceState } from "../domains/pricing/price-rules";

const item = (id: string, category: string, extra: Partial<PriceItem> = {}): PriceItem => ({
  id, name: id, category, groupId: null, itemMargin: null, cost: 1000, price: 1150, appliedCost: null, appliedMargin: null, appliedRounding: null, active: true, directPrice: null, ...extra,
});
const state = (items: PriceItem[], groups: PriceState["groups"] = [], categories: PriceState["categories"] = [], defaultMargin = 15): PriceState =>
  ({ groups, categories, items, defaultMargin, defaultRounding: 10, pendingCount: 0, total: items.length, page: 1, pageSize: 50, lastBatch: null, restored: false });

describe("margin tree (CC-18)", () => {
  it("matches folders by path steps, including children, not by string prefix", () => {
    expect(inFolder("농산 > 채소류 > 조미채소", "농산 > 채소류")).toBe(true);
    expect(inFolder("농산 > 채소류", "농산 > 채소류")).toBe(true);
    expect(inFolder("농산물 > 채소류", "농산")).toBe(false);
    expect(inFolder("농산>채소류", "농산 > 채소류")).toBe(true);
    expect(inFolder("공산품", null)).toBe(true);
  });

  it("counts active products per folder and shows each folder's margin source", () => {
    const items = [item("a", "농산 > 채소류"), item("b", "농산 > 과일류"), item("c", "수산 > 생선"), item("z", "수산 > 생선", { active: false })];
    const s = state(items, [{ id: "g1", name: "채소류 마진", margin: 20, rounding: 10 }], [{ category: "농산 > 채소류", groupId: "g1" }]);
    const tree = Object.fromEntries(buildMarginTree(items, s).map((n) => [n.path, n]));
    expect(tree["농산 > 채소류"]).toMatchObject({ count: 1, badge: "20%", tone: "margin", depth: 1, name: "채소류" });
    expect(tree["농산 > 과일류"]).toMatchObject({ badge: "기본", tone: "default" });
    expect(tree["농산"]).toMatchObject({ count: 2, badge: "혼합", tone: "mixed", depth: 0 });
    expect(tree["수산 > 생선"].count).toBe(1);
  });

  it("applies price priority: direct price, then item margin, then group, then default", () => {
    const g = [{ id: "g1", name: "그룹", margin: 20, rounding: 10 }];
    const links = [{ category: "농산", groupId: "g1" }];
    const s = state([], g, links);
    expect(effectiveMargin(item("1", "농산", { directPrice: 900 }), s)).toEqual({ margin: null, kind: "direct" });
    expect(effectiveMargin(item("2", "농산", { itemMargin: 7 }), s)).toEqual({ margin: 7, kind: "item" });
    expect(effectiveMargin(item("3", "농산"), s)).toEqual({ margin: 20, kind: "group" });
    expect(effectiveMargin(item("4", "수산"), s)).toEqual({ margin: 15, kind: "default" });
  });

  it("a folder whose products all share one non-default margin shows it, even from item overrides", () => {
    const items = [item("a", "공산품", { itemMargin: 12 }), item("b", "공산품", { itemMargin: 12 })];
    expect(buildMarginTree(items, state(items))[0]).toMatchObject({ badge: "12%", tone: "margin" });
    const mixed = [item("a", "공산품", { itemMargin: 12 }), item("b", "공산품")];
    expect(buildMarginTree(mixed, state(mixed))[0].badge).toBe("혼합");
    const direct = [item("a", "공산품", { directPrice: 500 })];
    expect(buildMarginTree(direct, state(direct))[0].badge).toBe("직접");
  });

  it("collects the original category strings for a folder, with or without children, from products and links", () => {
    const items = [item("a", "농산 > 채소류"), item("b", "농산 > 채소류 > 조미채소"), item("c", "농산>과일류"), item("d", "수산")];
    const links = [{ category: "농산 > 채소류 > 잎채소" }, { category: "수산 > 생선" }];
    expect(rawPathsInFolder(items, links, "농산 > 채소류", true)).toEqual(["농산 > 채소류", "농산 > 채소류 > conditional".replace("conditional", "잎채소"), "농산 > 채소류 > 조미채소"].sort((a, b) => a.localeCompare(b, "ko")));
    expect(rawPathsInFolder(items, links, "농산 > 채소류", false)).toEqual(["농산 > 채소류"]);
    expect(rawPathsInFolder(items, links, "농산", true).length).toBe(4);
  });
});
