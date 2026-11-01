import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../components/product-catalog-admin.tsx", import.meta.url),
  "utf8",
);

describe("product common category tab", () => {
  it("keeps the third tab behind the existing category flag", () => {
    expect(source).toContain('categoriesEnabled ? <button');
    expect(source).toContain("마주 공통 카테고리");
    expect(source).toContain("공통 카테고리 미연결");
  });

  it("does not expose an unfinished CategoryMatch action", () => {
    expect(source).toContain("연결 편집은 SQL 승인 후 제공합니다.");
    expect(source).not.toContain("CategoryMatch 시작");
  });
});
