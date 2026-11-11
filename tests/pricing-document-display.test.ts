import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, parseDisplay } from "../domains/pricing/document";

// CC-15: 과세·면세 글자는 기본 숨김. 값이 없는 기존 문서·발행본도 숨김으로 읽는다(가격 계산은 그대로).
describe("document display showTaxType", () => {
  it("defaults to hidden", () => {
    expect(DEFAULT_DISPLAY.showTaxType).toBe(false);
    expect(parseDisplay(undefined).showTaxType).toBe(false);
  });

  it("reads old documents without the field as hidden and keeps other settings", () => {
    const old = parseDisplay({ columns: 2, promoLayout: "table", info: [], productWidth: 70, priceIncludesTax: true });
    expect(old.showTaxType).toBe(false);
    expect(old.priceIncludesTax).toBe(true);
    expect(old.columns).toBe(2);
  });

  it("only an explicit true shows it", () => {
    expect(parseDisplay({ showTaxType: true }).showTaxType).toBe(true);
    expect(parseDisplay({ showTaxType: "true" }).showTaxType).toBe(false);
    expect(parseDisplay({ showTaxType: 1 }).showTaxType).toBe(false);
  });
});
