import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFolderTree, orderByFolder, toFolderOrder } from "../domains/pricing/category-tree";
import { filterIndex } from "../domains/pricing/catalog-filter";

// CC-26: 문서 상품 고르기 — 상품관리와 같은 폴더 순서·트리, 폴더 통째 담기.
const order = toFolderOrder([{ path: "축산", sortOrder: 1 }, { path: "농산", sortOrder: 2 }, { path: "농산 > 채소류", sortOrder: 1 }, { path: "농산 > 과일", sortOrder: 2 }]);

describe("buildFolderTree", () => {
  it("lists folders in the saved folder order with children right below their parent and counts that include children", () => {
    const tree = buildFolderTree(["농산 > 과일", "농산 > 채소류", "농산 > 채소류", "축산", "공산품 > 면"], order);
    expect(tree.map((n) => `${"-".repeat(n.depth)}${n.name}:${n.count}`)).toEqual(["축산:1", "농산:3", "-채소류:2", "-과일:1", "공산품:1", "-면:1"]);
  });
  it("is empty without categories (unclassified products are not folders)", () => {
    expect(buildFolderTree([], order)).toEqual([]);
  });
});

describe("orderByFolder", () => {
  it("orders by folder order, keeps the original order inside a folder, and puts unclassified products last", () => {
    const items = [{ id: "a" }, { id: "b", category: "농산 > 과일" }, { id: "c", category: "축산" }, { id: "d", category: "농산 > 채소류" }, { id: "e", category: "농산 > 과일" }];
    expect(orderByFolder(items, order).map((i) => i.id)).toEqual(["c", "d", "b", "e", "a"]);
  });
  it("does not change the order when there is no folder order (name order inside)", () => {
    expect(orderByFolder([{ id: "x", category: "나" }, { id: "y", category: "가" }]).map((i) => i.id)).toEqual(["y", "x"]);
  });
  it("still works with the text filter (category is carried on index items)", () => {
    const items = [{ id: "1", code: "", name: "배추", displayName: "", spec: "", unit: "", category: "농산 > 채소류" }, { id: "2", code: "", name: "사과", displayName: "", spec: "", unit: "", category: "농산 > 과일" }];
    expect(filterIndex(items, { all: "사과", code: "", name: "", spec: "", unit: "" }).map((i) => i.id)).toEqual(["2"]);
  });
});

describe("picker and index API contract", () => {
  const picker = readFileSync("components/pricing-product-picker.tsx", "utf8");
  const api = readFileSync("app/api/pricing-documents/catalog-index/route.ts", "utf8");
  it("the index API carries the category", () => {
    expect(api).toContain("sales_product_name,category,sales_spec");
    expect(api).toContain('category: (row.category || "").trim()');
  });
  it("adding a folder skips products already in the document, loads prices 100 at a time and caps one click at 300", () => {
    expect(picker).toContain("folderItems.filter((item) => !added.has(item.id))");
    expect(picker).toContain("loadPrices(ids.slice(start, start + 100))");
    expect(picker).toContain("folderAddable.slice(0, 300)");
    expect(picker).toContain("이미 담긴");
  });
  it("falls back to name order when the folder order cannot be read", () => {
    expect(picker).toContain("setFolderOrder(new Map())");
  });
});
