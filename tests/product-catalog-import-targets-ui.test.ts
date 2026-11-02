import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  new URL("../components/product-catalog-workspace.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../app/revenue/products/page.tsx", import.meta.url),
  "utf8",
);

describe("product import target selector", () => {
  it("lists the four approved targets without exposing unfinished writes", () => {
    for (const label of ["상품 마스터", "매출처 · 매입처", "거래처 원장", "재고"]) {
      expect(workspaceSource).toContain(label);
    }
    expect(workspaceSource).toContain('disabled={!enabled} name="import-target"');
    expect(workspaceSource).toContain("매입처 단가표를 적재한 뒤");
  });

  it("keeps the target selector off unless the server flag is explicitly true", () => {
    expect(pageSource).toContain(
      'importTargetsEnabled={isFeatureEnabled("PRODUCT_IMPORT_TARGETS", companyId)}',
    );
  });
});
