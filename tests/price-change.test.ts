import { describe, expect, it } from "vitest";
import { calculatePurchasePriceChange, type PurchasePriceRecord } from "../domains/pricing/price-change";

const row = (id: string, effectiveDate: string, recordedAt: string, price: number, validity: PurchasePriceRecord["validity"] = "valid"): PurchasePriceRecord => ({
  id, effectiveDate, recordedAt, price, validity
});

describe("calculatePurchasePriceChange", () => {
  it("compares the last valid price of the day with the preceding valid day", () => {
    const result = calculatePurchasePriceChange([
      row("previous", "2026-11-08", "2026-11-08T01:00:00Z", 100),
      row("early", "2026-11-10", "2026-11-10T01:00:00Z", 105),
      row("last", "2026-11-10", "2026-11-10T02:00:00Z", 110),
      row("cancelled", "2026-11-09", "2026-11-09T01:00:00Z", 999, "cancelled"),
      row("corrected", "2026-11-09", "2026-11-09T02:00:00Z", 888, "corrected"),
      row("returned", "2026-11-09", "2026-11-09T03:00:00Z", 777, "returned")
    ], "2026-11-10");

    expect(result).toMatchObject({ state: "up", currentPrice: 110, previousPrice: 100, shouldDisplay: true });
    expect(result.changePercent).toBeCloseTo(10);
  });

  it("keeps the latest valid price without showing a change on a no-purchase day", () => {
    expect(calculatePurchasePriceChange([
      row("previous", "2026-11-08", "2026-11-08T01:00:00Z", 100)
    ], "2026-11-10")).toEqual({
      state: "no_purchase", currentPrice: 100, previousPrice: null, changePercent: null, shouldDisplay: false
    });
  });

  it("hides changes smaller than 0.5 percent and exposes larger decreases", () => {
    const previous = row("previous", "2026-11-09", "2026-11-09T01:00:00Z", 1_000);
    expect(calculatePurchasePriceChange([previous, row("steady", "2026-11-10", "2026-11-10T01:00:00Z", 1_004)], "2026-11-10")).toMatchObject({
      state: "steady", shouldDisplay: false
    });
    expect(calculatePurchasePriceChange([previous, row("down", "2026-11-10", "2026-11-10T01:00:00Z", 990)], "2026-11-10")).toMatchObject({
      state: "down", shouldDisplay: true
    });
  });

  it("does not invent a rate without a prior valid purchase", () => {
    expect(calculatePurchasePriceChange([
      row("invalid", "2026-11-09", "2026-11-09T01:00:00Z", 0),
      row("first", "2026-11-10", "2026-11-10T01:00:00Z", 100)
    ], "2026-11-10")).toEqual({
      state: "first_purchase", currentPrice: 100, previousPrice: null, changePercent: null, shouldDisplay: false
    });
  });
});
