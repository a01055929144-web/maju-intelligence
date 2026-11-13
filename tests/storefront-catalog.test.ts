import { describe, expect, it } from "vitest";
import { lastDispatchLabel, priceOrNull, todayBaseOnly } from "../domains/pricing/storefront-catalog";

describe("storefront catalog display rules", () => {
  it("keeps only positive server prices", () => {
    expect(priceOrNull(6200)).toBe(6200);
    expect(priceOrNull(0)).toBeNull();
    expect(priceOrNull(null)).toBeNull();
    expect(priceOrNull("6200")).toBeNull();
  });
  it("shows today's base price only when the purchase date is today", () => {
    expect(todayBaseOnly("2026-11-13", "2026-11-13", 6200)).toBe(6200);
    expect(todayBaseOnly("2026-11-12", "2026-11-13", 6200)).toBeNull();
    expect(todayBaseOnly(null, "2026-11-13", 6200)).toBeNull();
  });
  it("formats the last dispatch label for this store only", () => {
    expect(lastDispatchLabel({ price: 5800, date: "2026-11-12" })).toBe("지난 출고 11/12 · 5,800원");
    expect(lastDispatchLabel(null)).toBe("");
  });
});
