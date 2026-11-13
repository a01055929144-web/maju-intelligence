import { describe, expect, it } from "vitest";
import { CATEGORY_ALIASES, CATEGORY_TREE, canonicalCategory, categoryHealth, cleanCategory, splitCategory, treePaths } from "../domains/pricing/product-category";

describe("CC-27 standard category scheme", () => {
  it("has 공산품 as a top level with the six former groups under it and 특수채소 under 채소류", () => {
    expect(CATEGORY_TREE.map((node) => node.name)).toEqual(["농산", "축산", "수산", "공산품", "비식품", "기타"]);
    const paths = treePaths();
    for (const middle of ["양념·조미료", "가공식품", "유제품", "일배식품", "냉동식품", "음료·주류"]) expect(paths).toContain(`공산품 > ${middle}`);
    expect(paths).toContain("농산 > 채소류 > 특수채소");
  });
  it("never repeats the same small category inside 공산품 or across its middle groups", () => {
    const smalls = treePaths().filter((path) => path.startsWith("공산품 > ") && splitCategory(path).length === 3).map((path) => splitCategory(path)[2]);
    // 커피·차 는 음료·주류 한 곳에만 있어야 한다(예전엔 공산품 > 음료·차 와 음료·주류 둘 다 있었음)
    expect(smalls.filter((name) => name === "커피·차")).toHaveLength(1);
    expect(new Set(smalls).size).toBe(smalls.length);
  });
  it("keeps every alias target inside the standard tree (or a standard parent)", () => {
    const standard = new Set(treePaths());
    for (const [, to] of CATEGORY_ALIASES) expect(standard.has(to.join(" > "))).toBe(true);
  });
  it("turns every old path into a standard one and is idempotent", () => {
    const standard = new Set(treePaths());
    for (const [from] of CATEGORY_ALIASES) {
      const canonical = canonicalCategory(from.join(" > "));
      expect(standard.has(canonical)).toBe(true);
      expect(canonicalCategory(canonical)).toBe(canonical);
    }
  });
  it.each([
    ["양념·조미료 > 장류", "공산품 > 양념·조미료 > 장류"],
    ["가공식품", "공산품 > 가공식품"],
    ["공산품 > 조미·장류 > 소스·드레싱", "공산품 > 양념·조미료 > 소스·드레싱"],
    ["공산품 > 조미·장류 > 분말조미·시즈닝", "공산품 > 양념·조미료 > 소금·조미료"],
    ["공산품 > 면·곡물가공 > 파스타", "공산품 > 가공식품 > 면·파스타"],
    ["공산품 > 통조림·절임 > 피클·절임", "공산품 > 일배식품 > 김치·절임"],
    ["공산품 > 제과·베이커리 > 빵·믹스", "공산품 > 가공식품 > 빵·제과"],
    ["공산품 > 음료·차 > 커피·차", "공산품 > 음료·주류 > 커피·차"],
    ["공산품 > 유가공·육가공 > 치즈·유제품", "공산품 > 유제품 > 치즈"],
    ["특수채소", "농산 > 채소류 > 특수채소"],
    ["농산 > 채소류 > 특수채소", "농산 > 채소류 > 특수채소"],
    ["농산물", "농산물"],
  ])("%s → %s", (from, to) => { expect(canonicalCategory(from)).toBe(to); });
  it("applies the alias when a category is saved through cleanCategory (3 levels kept)", () => {
    expect(cleanCategory("양념·조미료>장류")).toBe("공산품 > 양념·조미료 > 장류");
    expect(cleanCategory("공산품 > 유가공·육가공 > 치즈·유제품")).toBe("공산품 > 유제품 > 치즈");
    expect(cleanCategory("회사분류 > 냉장")).toBe("회사분류 > 냉장");
  });
});

describe("CC-27 similar-category check", () => {
  it("suggests merging old paths, reports unknown top levels and products stuck above a sub category", () => {
    const health = categoryHealth({
      "양념·조미료 > 소스·드레싱": 30,
      "공산품 > 양념·조미료 > 소스·드레싱": 9,
      "베이커리 > 빵": 4,
      "공산품": 3,
      "농산 > 채소류": 5,
      "농산 > 채소류 > 엽채류": 28,
      "축산 > 돈육 > 갈비": 2,
      "축산 > 우육 > 갈비": 3,
    });
    expect(health.legacy).toEqual([{ from: "양념·조미료 > 소스·드레싱", to: "공산품 > 양념·조미료 > 소스·드레싱", count: 30 }]);
    expect(health.unknownTop).toEqual([{ top: "베이커리", count: 4 }]);
    expect(health.missingSub.map((item) => item.path).sort()).toEqual(["공산품", "농산 > 채소류"]);
    // 돈육·우육 갈비는 표준 체계가 일부러 겹치게 둔 이름이라 같은 소분류 경고에서 제외
    expect(health.sameLeaf).toEqual([]);
  });
  it("flags the same small category under two middle groups when the tree does not intend it", () => {
    const health = categoryHealth({ "회사 > 냉장 > 소스": 2, "회사 > 상온 > 소스": 3 });
    expect(health.sameLeaf).toEqual([{ leaf: "소스", paths: [{ path: "회사 > 냉장 > 소스", count: 2 }, { path: "회사 > 상온 > 소스", count: 3 }] }]);
  });
  it("ignores empty folders and accepts a Map", () => {
    const health = categoryHealth(new Map([["가공식품", 0], ["가공식품 > 면·파스타", 2]]));
    expect(health.legacy).toEqual([{ from: "가공식품 > 면·파스타", to: "공산품 > 가공식품 > 면·파스타", count: 2 }]);
  });
});
