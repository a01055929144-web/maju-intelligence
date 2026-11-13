import { describe, expect, it } from "vitest";
import { pickDocumentPrice } from "../domains/pricing/document-price";
import { parseDocument } from "../domains/pricing/document";

describe("pickDocumentPrice", () => {
  it("prefers the store price, then the grade price, then the base price", () => {
    expect(pickDocumentPrice({ store: 900, grade: 1000, base: 1100 })).toEqual({ price: 900, source: "store" });
    expect(pickDocumentPrice({ store: null, grade: 1000, base: 1100 })).toEqual({ price: 1000, source: "grade" });
    expect(pickDocumentPrice({ grade: 0, base: 1100 })).toEqual({ price: 1100, source: "base" });
  });
  it("returns null when no price exists so the line keeps its current price", () => {
    expect(pickDocumentPrice({ store: 0, grade: null, base: undefined })).toBeNull();
  });
});

describe("parseDocument priceSource", () => {
  const line = { productId: "10000000-0000-4000-8000-000000000001", displayName: "상품", brand: "", spec: "", unit: "개", price: 100, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" };
  const doc = (priceSource: unknown) => parseDocument({ kind: "quote", title: "t", companyName: "c", contact: "", recipient: "", footer: "", validUntil: "2026-11-30", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: [{ ...line, priceSource }] });
  it("keeps a known price source and drops anything else", () => {
    expect(doc("edited").lines[0].priceSource).toBe("edited");
    expect(doc("hack").lines[0].priceSource).toBeUndefined();
  });
});
