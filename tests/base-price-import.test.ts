import { describe, expect, it } from "vitest";
import { buildBasePriceImportPreview, suggestBasePriceImportMapping } from "../domains/product/base-price-import";

describe("base price import", () => {
  it("maps ERP reference price headers to dated base prices", () => {
    expect(suggestBasePriceImportMapping(["기준일", "품목코드", "참고매입가", "참고매출가"])).toEqual({ effectiveDate: "기준일", productCode: "품목코드", baseCost: "참고매입가", basePrice: "참고매출가" });
  });
  it("builds a dated preview and excludes invalid rows", () => {
    const preview = buildBasePriceImportPreview([
      { 날짜: "2026.11.03", 코드: "A-1", 매입: "1,200원", 매출: "1,500" },
      { 날짜: "잘못된 날짜", 코드: "A-2", 매입: 1000, 매출: 1200 },
      { 날짜: "2026-11-03", 코드: "", 매입: 1000, 매출: 1200 },
    ], { effectiveDate: "날짜", productCode: "코드", baseCost: "매입", basePrice: "매출" });
    expect(preview.items).toEqual([{ sourceRowNumber: 2, effectiveDate: "2026-11-03", productCode: "A-1", productName: "", baseCost: 1200, basePrice: 1500 }]);
    expect(preview.excluded).toEqual({ "적용일 오류": 1, "상품 식별값 없음": 1 });
  });
  it("requires date, both prices, and one product identifier", () => {
    expect(() => buildBasePriceImportPreview([], { effectiveDate: "날짜", baseCost: "매입", basePrice: "매출" })).toThrow("상품 코드 또는 상품명");
  });
});
