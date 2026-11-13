import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CC-26: 상품관리 표의 상품을 왼쪽 분류 트리 폴더로 끌어 분류를 바꾼다(화면 코드 계약 확인).
const source = readFileSync("components/product-catalog-admin.tsx", "utf8");

describe("product drag to folder (CC-26)", () => {
  it("only managers get the drag handle column", () => {
    expect(source).toContain("...(canManageCategories ? [{ key: \"dragHandle\"");
  });
  it("drops move one product with the expected current category (no blind overwrite) and never into 미분류 or the same folder", () => {
    expect(source).toContain('action: "update-categories"');
    expect(source).toContain("expectedCategory: item.category");
    expect(source).toContain('canManageCategories && target !== "미분류" && (product!.category || "미분류") !== target');
  });
  it("recalculates prices after the move and keeps the move when recalculation fails", () => {
    expect(source).toContain('action: "recalculate"');
    expect(source).toContain("판매가 재계산은 가격 관리에서 다시 해 주세요.");
  });
  it("folder drags are untouched (folder drop still goes through canDrop/moveFolder)", () => {
    expect(source).toContain("if (from && canDrop(from, item.name)) void moveFolder(from, item.name);");
  });
});
