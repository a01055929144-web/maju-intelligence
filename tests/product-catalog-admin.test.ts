import { describe, expect, it } from "vitest";
import { productCatalogMargin } from "../lib/product-catalog-presentation";

describe("product catalog admin presentation", () => {
  it("calculates markup and exposes reverse margins", () => {
    expect(productCatalogMargin({ purchasePrice: 100, salesPrice: 125 })).toBe(25);
    expect(productCatalogMargin({ purchasePrice: 100, salesPrice: 80 })).toBe(-20);
  });

  it("does not calculate a margin without a usable purchase price", () => {
    expect(productCatalogMargin({ purchasePrice: 0, salesPrice: 100 })).toBeUndefined();
    expect(productCatalogMargin({ purchasePrice: 100 })).toBeUndefined();
  });
});
