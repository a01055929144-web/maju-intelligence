import { describe, expect, it } from "vitest";
import { basketLineError, discountFromPrice, marginFromPrice, priceFromDiscount, quickRange } from "../domains/pricing/promotion-basket";

describe("promotion basket (CC-34-2)", () => {
  it("converts between 행사가 and 할인 %", () => {
    expect(priceFromDiscount(10000, 10)).toBe(9000);
    expect(discountFromPrice(10000, 9000)).toBe(10);
    expect(discountFromPrice(0, 100)).toBeNull();
    expect(priceFromDiscount(100, 150)).toBe(0);
  });
  it("derives a 2-decimal margin from cost and price", () => {
    expect(marginFromPrice(1000, 1180)).toBe(18);
    expect(marginFromPrice(3, 4)).toBe(33.33);
    expect(marginFromPrice(0, 4)).toBeNull();
  });
  it("quick ranges: this week ends Sunday, next week Mon–Sun, month ends on its last day", () => {
    expect(quickRange("2026-11-13", "thisWeek")).toEqual({ startsOn: "2026-11-13", endsOn: "2026-11-15" });
    expect(quickRange("2026-11-13", "nextWeek")).toEqual({ startsOn: "2026-11-16", endsOn: "2026-11-22" });
    expect(quickRange("2026-11-15", "thisWeek")).toEqual({ startsOn: "2026-11-15", endsOn: "2026-11-15" });
    expect(quickRange("2026-02-10", "thisMonth")).toEqual({ startsOn: "2026-02-10", endsOn: "2026-02-28" });
  });
  it("flags lines that cannot be saved", () => {
    expect(basketLineError({ productId: "a", cost: 0, price: 100, regular: 120 })).toMatch(/매입가/);
    expect(basketLineError({ productId: "a", cost: 100, price: 0, regular: 120 })).toMatch(/행사가/);
    expect(basketLineError({ productId: "a", cost: 100, price: 2000, regular: 3000 })).toMatch(/11배/);
    expect(basketLineError({ productId: "a", cost: 100, price: 110, regular: 120 })).toBeNull();
  });
});
