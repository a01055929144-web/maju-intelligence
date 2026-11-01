import { describe, expect, it } from "vitest";
import { calculatePrice } from "../domains/pricing/price-rules";
import {
  documentOutput,
  lineFromCatalog,
  withMargin,
  type DocumentVersion,
} from "../domains/pricing/document";
import {
  calculateSalesPrice,
  calculateQuoteTaxLine,
  toCustomerQuoteLines,
  type QuoteLine,
} from "../domains/quote/quote";
import { calculateErpLine } from "../domains/erp/business-document";

// Characterization for ARC-05/06. These examples do not approve a legacy basis migration or activate #99.
const line = lineFromCatalog({
  id: "10000000-0000-4000-8000-000000000001",
  name: "INTERNAL-VALUE",
  displayName: "공개 품목",
  brand: "",
  spec: "1kg",
  unit: "봉",
  price: 0,
  cost: 18910,
  taxType: "exempt",
});
describe("ARC-05 current cross-module contracts", () => {
  it("P0 and P1 share markup, while legacy quote gross margin remains a separately identified migration boundary", () => {
    const expected = calculatePrice(18910, 12, 10);
    expect(withMargin(line, 18910, 12, 10).price).toBe(expected);
    expect(expected).toBe(21180);
    expect(calculateSalesPrice(18910, 12, 10)).toBe(21490);
    expect(line.price).toBe(0);
  });

  it.each([
    {
      unitPrice: 101,
      quantity: 0.5,
      taxType: "taxable" as const,
      expected: { supplyAmount: 51, taxAmount: 5, totalAmount: 56 },
    },
    {
      unitPrice: 123,
      quantity: 0.25,
      taxType: "taxable" as const,
      expected: { supplyAmount: 31, taxAmount: 3, totalAmount: 34 },
    },
    {
      unitPrice: 21180,
      quantity: 0.125,
      taxType: "exempt" as const,
      expected: { supplyAmount: 2648, taxAmount: 0, totalAmount: 2648 },
    },
  ])(
    "quote and 03 ERP agree on VAT-exclusive integer-won rounding: $unitPrice × $quantity",
    ({ unitPrice, quantity, taxType, expected }) => {
      expect(calculateQuoteTaxLine(unitPrice, quantity, taxType)).toEqual(
        expected,
      );
      expect(calculateErpLine({ unitPrice, quantity, taxType })).toEqual(
        expected,
      );
    },
  );

  it("legacy and P1 public projections both discard injected internal fields without mutating snapshots", () => {
    const privateFields = {
      supplierName: "INTERNAL-VALUE",
      conversion: { source: "INTERNAL-VALUE" },
      entranceSecret: "INTERNAL-VALUE",
    };
    const quote: QuoteLine = Object.assign(
      {
        id: "line",
        item: "공개 품목",
        spec: "1kg",
        unit: "봉",
        qty: 1,
        purchasePrice: 18910,
        unitPrice: 21180,
        marginRate: 12,
        matchStatus: "matched" as const,
      },
      privateFields,
    );
    const publishedLine = Object.assign(
      { ...line, price: 21180 },
      privateFields,
    );
    const version: DocumentVersion = {
      id: "version",
      documentId: "document",
      version: 1,
      revision: 1,
      publishedAt: "2026-11-01T00:00:00Z",
      unavailablePromotions: [],
      content: {
        kind: "sheet",
        title: "공개 문서",
        companyName: "합성 회사",
        contact: "",
        recipient: "",
        footer: "",
        validUntil: "2099-12-31",
        theme: "blue",
        layout: "table",
        showPrice: true,
        showBrand: true,
        showSpec: true,
        lines: [publishedLine],
      },
    };
    const before = JSON.stringify(version);
    for (const output of [
      toCustomerQuoteLines([quote]),
      documentOutput(version, "2026-11-01"),
    ]) {
      const publicJson = JSON.stringify(output);
      for (const marker of [
        "INTERNAL-VALUE",
        "purchasePrice",
        "supplierName",
        "marginRate",
        "conversion",
        "entranceSecret",
      ])
        expect(publicJson).not.toContain(marker);
      expect(publicJson).toContain("21180");
    }
    expect(JSON.stringify(version)).toBe(before);
  });
});
