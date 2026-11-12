import { describe, expect, it } from "vitest";
import { pickDocumentPrice } from "../domains/pricing/document-price";

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
