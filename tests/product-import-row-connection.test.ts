import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const workspace = read("../components/product-catalog-workspace.tsx");
const page = read("../app/revenue/products/page.tsx");
const route = read("../app/api/product-catalog/imports/route.ts");
const store = read("../lib/product-catalog-import.ts");

describe("product import row editor connection", () => {
  it("keeps the editor behind both default-off server flags", () => {
    expect(page).toContain('rowEditorEnabled={process.env.IMPORT_ROW_EDITOR_ENABLED === "true"}');
    expect(workspace).toContain("rowEditorEnabled && auditV2Enabled");
    expect(route).toContain('process.env.PRODUCT_IMPORT_AUDIT_V2_ENABLED === "true"');
    expect(route).toContain('process.env.IMPORT_ROW_EDITOR_ENABLED === "true"');
  });

  it("sends edited values and stores original and normalized rows", () => {
    expect(workspace).toContain("editedRows: activeRows");
    expect(store).toContain("raw_values: row.originalValues");
    expect(store).toContain("normalized_values: row.values");
    expect(store).toContain('status: "applied"');
    expect(store).toContain('status: "failed"');
  });
});
