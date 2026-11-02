import { expect, it } from "vitest";
import { importDocumentExcelRows, parseDocumentExcelRows } from "../domains/pricing/document-excel";
import type { CatalogChoice } from "../domains/pricing/document";

const catalog: CatalogChoice[] = [
  { id: "a", productCode: "P-1", name: "양파", displayName: "국산 양파", brand: "", spec: "10kg", unit: "박스", price: 12000, taxType: "exempt" },
  { id: "b", productCode: "P-2", name: "두부", displayName: "두부", brand: "", spec: "1kg", unit: "개", price: 3000, taxType: "exempt" },
];

it("matches ERP code before name and preserves the Excel sale price", () => {
  const rows = parseDocumentExcelRows([{ "ERP 코드": "P-1", "품목명": "다른 이름", "판매가": "13,000" }]);
  const result = importDocumentExcelRows(rows, catalog, []);
  expect(result.added[0]).toMatchObject({ productId: "a", price: 13000 });
  expect(result.unmatched).toEqual([]);
});

it("uses a unique product name and reports ambiguous or missing products", () => {
  const rows = parseDocumentExcelRows([{ 품목명: "두부" }, { 품목명: "없는 상품" }]);
  const result = importDocumentExcelRows(rows, catalog, []);
  expect(result.added).toHaveLength(1);
  expect(result.unmatched).toEqual(["없는 상품"]);
});
