import { describe, expect, it } from "vitest";
import { compareCategoryPath, sortCategoryPaths, toFolderOrder } from "../domains/pricing/category-tree";

const order = toFolderOrder([
  { path: "농산", sortOrder: 0 }, { path: "축산", sortOrder: 1 }, { path: "수산", sortOrder: 2 }, { path: "공산품", sortOrder: 3 }, { path: "비식품", sortOrder: 4 }, { path: "기타", sortOrder: 5 },
  { path: "공산품 > 가공식품", sortOrder: 1 }, { path: "공산품 > 양념·조미료", sortOrder: 0 },
]);

describe("compareCategoryPath (CC-26)", () => {
  it("sorts top-level folders by the saved order, not by name", () => {
    expect(sortCategoryPaths(["기타", "공산품", "수산", "축산", "농산", "비식품"], order)).toEqual(["농산", "축산", "수산", "공산품", "비식품", "기타"]);
  });
  it("sorts within a parent by the saved order, parents before their children", () => {
    expect(sortCategoryPaths(["공산품 > 가공식품 > 빵·제과", "공산품", "공산품 > 양념·조미료", "공산품 > 가공식품"], order))
      .toEqual(["공산품", "공산품 > 양념·조미료", "공산품 > 가공식품", "공산품 > 가공식품 > 빵·제과"]);
  });
  it("puts folders without an order after ordered siblings, then by name", () => {
    expect(sortCategoryPaths(["공산품 > 유제품", "공산품 > 냉동식품", "공산품 > 가공식품"], order)).toEqual(["공산품 > 가공식품", "공산품 > 냉동식품", "공산품 > 유제품"]);
  });
  it("falls back to name order without any folder order and is stable for equal paths", () => {
    expect(sortCategoryPaths(["수산", "농산", "축산"])).toEqual(["농산", "수산", "축산"]);
    expect(compareCategoryPath("농산 > 채소류", "농산 > 채소류", order)).toBe(0);
  });
  it("normalizes separators so A>B equals A > B", () => {
    expect(compareCategoryPath("공산품>양념·조미료", "공산품 > 가공식품", order)).toBeLessThan(0);
  });
});
