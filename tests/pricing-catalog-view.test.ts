import { describe, expect, it } from "vitest";
import { pricingCatalogViewFrom, pricingCatalogViews } from "@/components/pricing-catalog-view";

describe("pricing catalog view", () => {
  it("defaults an invalid view to prices", () => {
    expect(pricingCatalogViewFrom("unknown", true)).toBe("prices");
    expect(pricingCatalogViewFrom(null, true)).toBe("prices");
  });

  it("only exposes prices and groups when margin templates are off", () => {
    expect(pricingCatalogViews(false)).toEqual(["prices", "groups"]);
    expect(pricingCatalogViewFrom("catalogs", false)).toBe("prices");
    expect(pricingCatalogViewFrom("stores", false)).toBe("prices");
  });
});
