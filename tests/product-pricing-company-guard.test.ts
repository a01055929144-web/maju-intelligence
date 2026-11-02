import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("product pricing company guard", () => {
  it("guards the page and both import methods before existing capabilities", () => {
    const page = readFileSync("app/revenue/products/page.tsx", "utf8");
    const route = readFileSync("app/api/product-catalog/imports/route.ts", "utf8");
    expect(page).toContain('if (!isFeatureEnabled("PRICING", companyId)) notFound();');
    expect(page).not.toContain("SalesWorkspaceNav");
    expect(route.match(/if \(!isFeatureEnabled\("PRICING", scope\.companyId\)\)/g)).toHaveLength(2);
    expect(route.match(/status: 404/g)).toHaveLength(2);
    for (const method of ["GET", "POST"]) {
      const body = route.split(`export async function ${method}`)[1];
      expect(body.indexOf("isFeatureEnabled")).toBeLessThan(
        body.indexOf("scopeHasCapability"),
      );
    }
  });
});
