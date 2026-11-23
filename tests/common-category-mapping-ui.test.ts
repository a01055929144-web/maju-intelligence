import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/revenue/products/common-categories/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/common-category-mapping-workspace.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/product-categories/matches/route.ts", import.meta.url), "utf8");

describe("CX-95 common category mapping", () => {
  it("keeps the page and API behind the company allowlist", () => {
    expect(page).toContain("commonCategoryMappingEnabled(companyId)");
    expect(route).toContain("commonCategoryMappingEnabled(auth.companyId)");
  });

  it("shows loading, empty, error, mobile-safe controls and the 기타 contract", () => {
    expect(workspace).toContain("공통 카테고리를 불러오는 중입니다.");
    expect(workspace).toContain("검색 결과가 없습니다.");
    expect(workspace).toContain("다시 시도");
    expect(workspace).toContain("기타 (미연결)");
    expect(workspace).toContain("min-h-11");
  });

  it("limits edits to representatives and managers", () => {
    expect(route).toContain("canManagePriceSheets(auth.customerSession)");
    expect(page).toContain("canManagePriceSheets(customerSession)");
  });
});
