import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("CX-124 new store customer review", () => {
  it("keeps the distributor boundary and reuses existing review RPCs", () => {
    const route = readFileSync("app/api/business-partners/new-stores/route.ts", "utf8");
    expect(route).toContain('scopeHasCapability(scope, "manage_customers")');
    expect(route).toContain('isFeatureEnabled("PARTNER_REGISTRATION"');
    expect(route).toContain('isFeatureEnabled("NEW_STORE_CUSTOMER_REVIEW"');
    expect(route).toContain("reviewCandidates");
    expect(route).toContain("confirmNewCustomer");
    expect(route).toContain("linkExistingCustomer");
  });

  it("does not modify store profile or price-publication routes", () => {
    const route = readFileSync("app/api/business-partners/new-stores/route.ts", "utf8");
    expect(route).not.toContain("store_profiles");
    expect(route).not.toContain("price_public");
    expect(route).not.toContain("tax_invoice_email");
    expect(route).not.toContain("expected_opening_date");
  });
});
