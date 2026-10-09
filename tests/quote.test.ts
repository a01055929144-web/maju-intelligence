import { describe, expect, it } from "vitest";
import {
  calculateQuoteTotals,
  calculateSalesPrice,
  findCatalogMatch,
  resolveQuoteValidUntil,
  toCustomerQuoteLines,
  type QuoteLine
} from "../domains/quote/quote";

const line: QuoteLine = {
  id: "1",
  item: "식용유",
  spec: "18L",
  unit: "통",
  qty: 2,
  purchasePrice: 8_000,
  unitPrice: 10_000,
  marginRate: 20,
  matchStatus: "matched"
};

describe("quote domain", () => {
  it("calculates a sales price from gross margin", () => {
    expect(calculateSalesPrice(8_000, 20)).toBe(10_000);
    expect(calculateSalesPrice(8_000, 10)).toBe(8_890);
  });

  it("calculates weighted totals", () => {
    expect(calculateQuoteTotals([line])).toEqual({
      expectedProfit: 4_000,
      marginRate: 20,
      purchaseAmount: 16_000,
      salesAmount: 20_000
    });
  });

  it("removes internal cost and margin fields from customer rows", () => {
    const publicLine = toCustomerQuoteLines([line])[0];
    expect(publicLine).toEqual({ id: "1", item: "식용유", spec: "18L", unit: "통", qty: 2, unitPrice: 10_000, amount: 20_000 });
    expect("purchasePrice" in publicLine).toBe(false);
    expect("marginRate" in publicLine).toBe(false);
  });

  it("matches catalog products by normalized name, spec, and unit", () => {
    expect(findCatalogMatch({ item: "식용유", spec: "18 L", unit: "통" }, [{ id: "oil", name: "식용유", spec: "18L", unit: "통" }])?.id).toBe("oil");
  });

  it("sets and bounds a quote validity date", () => {
    expect(resolveQuoteValidUntil(14, new Date("2026-10-09T00:00:00.000Z"))).toBe("2026-10-23T00:00:00.000Z");
  });
});
