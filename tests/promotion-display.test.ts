import { describe, expect, it } from "vitest";
import { discountPercent, regularPrice } from "../domains/pricing/promotion-display";

describe("promotion display", () => {
  it("computes the regular price from cost and margin, rounded up to 10 won", () => {
    expect(regularPrice({ price: 800, regularCost: 1000, margin: 20 })).toBe(1200);
    expect(regularPrice({ price: 800, regularCost: 1001, margin: 20 })).toBe(1210);
    expect(regularPrice({ price: 800, regularCost: null, margin: 20 })).toBeNull();
    expect(regularPrice({ price: 800, regularCost: 1000, margin: null })).toBeNull();
  });
  it("gives a discount percent only when the sale price is below regular", () => {
    expect(discountPercent({ price: 900, regularCost: 1000, margin: 20 })).toBe(25);
    expect(discountPercent({ price: 1200, regularCost: 1000, margin: 20 })).toBeNull();
    expect(discountPercent({ price: 900 })).toBeNull();
  });
});
