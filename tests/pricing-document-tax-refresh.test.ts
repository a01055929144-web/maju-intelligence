import { expect, it } from "vitest";
import { lineFromCatalog } from "../domains/pricing/document";
import { countDocumentTaxMismatches, reviewDocumentTaxes } from "../domains/pricing/document-tax";
const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 상품", displayName: "합성 상품", brand: "", spec: "1kg", unit: "개", price: 1000, taxType: "taxable" as const };
const promotion = { id: "30000000-0000-4000-8000-000000000001", productId: product.id, taxType: "exempt" as const };
it("counts only draft lines whose known catalog tax differs", () => {
  const lines = [lineFromCatalog(product), { ...lineFromCatalog(product), taxType: "exempt" as const }, { ...lineFromCatalog(product), productId: "missing" }];
  expect(countDocumentTaxMismatches(lines, [product])).toBe(1);
});
it("changes only draft taxes after current product and promotion agree; no price/snapshot mutation", () => {
  const source = Object.freeze([Object.freeze(lineFromCatalog(product)), Object.freeze({ ...lineFromCatalog(product), promotionId: promotion.id, badge: "행사" as const })]);
  const before = JSON.stringify(source);
  const review = reviewDocumentTaxes(source, [{ ...product, taxType: "exempt" }], [promotion]);
  expect(review).toMatchObject({ changed: 2, toExempt: 2, toTaxable: 0 });
  expect(review.lines.map(line => line.taxType)).toEqual(["exempt", "exempt"]);
  expect(review.lines.map(({ taxType: _, ...line }) => line)).toEqual(source.map(({ taxType: _, ...line }) => line));
  expect(JSON.stringify(source)).toBe(before);
});
it("reports taxable and unknown-source-line corrections without inventing a price", () => {
  const line = { ...lineFromCatalog(product), taxType: "unknown" as const };
  expect(reviewDocumentTaxes([line], [product], [])).toMatchObject({ changed: 1, toExempt: 0, toTaxable: 1 });
});
it.each([
  { catalog: [], offers: [], message: "상품관리" },
  { catalog: [{ ...product, taxType: "unknown" as const }], offers: [], message: "상품관리" },
  { catalog: [{ ...product, taxType: "exempt" as const }], offers: [], message: "행사 화면" },
  { catalog: [product], offers: [promotion], message: "행사 화면" },
  { catalog: [{ ...product, taxType: "exempt" as const }], offers: [{ ...promotion, productId: "foreign" }], message: "행사 화면" },
])("keeps the whole draft unchanged on unavailable or mismatched source: $message", ({ catalog, offers, message }) => {
  const source = [lineFromCatalog(product), { ...lineFromCatalog(product), promotionId: promotion.id }];
  const before = JSON.stringify(source);
  expect(() => reviewDocumentTaxes(source, catalog, offers)).toThrow(message);
  expect(JSON.stringify(source)).toBe(before);
});
it("keeps identical lines by identity and handles all 300 rows", () => {
  const line = lineFromCatalog(product);
  const review = reviewDocumentTaxes(Array.from({ length: 300 }, () => line), [product], []);
  expect(review.changed).toBe(0); expect(review.lines).toHaveLength(300);
  expect(review.lines.every(item => item === line)).toBe(true);
});
