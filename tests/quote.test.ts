import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyDefaultMargin,
  calculateQuoteTaxLine,
  calculateQuoteTaxTotals,
  calculateQuoteTotals,
  calculateSalesPrice,
  findCatalogMatch,
  resolveQuoteValidUntil,
  resolveQuoteAgreementTaxType,
  toCustomerQuoteLines,
  validateSalesQuoteInput,
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

describe("quote tax snapshots", () => {
  it("rounds each line and separates taxable and exempt supplies", () => {
    expect(calculateQuoteTaxLine(101, 0.5, "taxable")).toEqual({ supplyAmount: 51, taxAmount: 5, totalAmount: 56 });
    expect(calculateQuoteTaxTotals([
      { quantity: 0.5, taxType: "taxable", unitPrice: 101 },
      { quantity: 2, taxType: "exempt", unitPrice: 500 }
    ])).toEqual({ taxableSupplyAmount: 51, exemptSupplyAmount: 1000, taxAmount: 5, totalAmount: 1056 });
  });

  it("uses snapshot first, falls back to catalog tax, and never guesses", () => {
    expect(resolveQuoteAgreementTaxType("exempt", "taxable")).toBe("exempt");
    expect(resolveQuoteAgreementTaxType(null, "exempt")).toBe("exempt");
    expect(resolveQuoteAgreementTaxType(null, null)).toBeNull();
  });
});

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

  it("recalculates only unlocked prices when the default margin changes", () => {
    const unlocked = { ...line, id: "unlocked", priceLocked: false };
    const locked = { ...line, id: "locked", priceLocked: true };
    const result = applyDefaultMargin([unlocked, locked], 10);
    expect(result[0].unitPrice).toBe(8_890);
    expect(result[0].marginRate).toBe(10);
    expect(result[1]).toEqual(locked);
  });

  it("allows a draft with an expired validity date but blocks publishing it", () => {
    const input = {
      leadId: "lead-1", defaultMarginPercent: 12, items: [{ productName: "식용유", quantity: 1, salesUnitPrice: 10_000, marginPercent: 12 }],
      validUntil: "2020-01-01T00:00:00.000Z"
    };
    expect(validateSalesQuoteInput({ ...input, status: "draft" }).validUntil).toBeUndefined();
    expect(validateSalesQuoteInput({ ...input, status: "sent" }).validUntil).toContain("현재 이후");
  });

  it("returns field-specific validation errors", () => {
    expect(validateSalesQuoteInput({ defaultMarginPercent: 95, items: [], status: "sent", validUntil: "" })).toEqual({
      subject: "리드 또는 거래처를 연결해 주세요.",
      items: "견적 품목은 1~100개여야 합니다.",
      margin: "마진율은 0~90% 사이로 입력해 주세요.",
      validUntil: "발행 유효기간은 현재 이후여야 합니다."
    });
  });

  it("keeps quote edits tenant-scoped", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    const editorStart = source.indexOf("export async function getSalesQuoteForEdit");
    const editorEnd = source.indexOf("export type SalesQuoteListItem", editorStart);
    const editorSource = source.slice(editorStart, editorEnd);
    expect(editorSource).toContain("company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(quoteId)}");
  });
});
