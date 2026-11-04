import { describe, expect, it } from "vitest";
import { buildPurchaseSheet, mergeDuplicateLines, parsePurchaseLines, splitNameSpec, suggestPurchaseMapping } from "../domains/pricing/purchase-import";
import { matchCostImportRow } from "../domains/pricing/purchase-cost";
import { buildPurchaseReceiptRows } from "../domains/pricing/purchase-receipt";

const matrix = [
  ["거래명세서", "", "", "", "", ""],
  ["품목명(규격)", "수량", "단가", "공급가액", "부가세", "합계"],
  ["냉동오징어 [EA]", "5", "4500", "22500", "", "22500"],
  ["훈제연어 슬라이스(화이트베어) [KG]", "9", "29000", "261000", "", "261000"],
  ["냉동오징어 [EA]", "2", "4600", "9200", "", "9200"],
  ["", "", "", "", "", ""]
];

describe("purchase import", () => {
  it("finds the real header row below a title row and suggests columns", () => {
    const sheet = buildPurchaseSheet(matrix);
    expect(sheet.headerRowNumber).toBe(2);
    expect(sheet.columns[0]).toMatchObject({ header: "품목명(규격)", letter: "A" });
    expect(sheet.rows).toHaveLength(3);
    expect(suggestPurchaseMapping(sheet)).toMatchObject({ name: 0, quantity: 1, cost: 2, supplyAmount: 3, vatAmount: 4, totalAmount: 5 });
  });

  it("labels columns by letter when there is no header", () => {
    const sheet = buildPurchaseSheet([["양파", "1000"]]);
    expect(sheet.headerRowNumber).toBe(0);
    expect(sheet.columns.map((column) => column.letter)).toEqual(["A", "B"]);
  });

  it("splits bracketed spec and keeps VAT-excluded prices when price×qty matches supply amount", () => {
    expect(splitNameSpec("냉동오징어 [EA]", "")).toEqual({ name: "냉동오징어", spec: "EA" });
    const sheet = buildPurchaseSheet(matrix);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "auto");
    expect(lines[0]).toMatchObject({ name: "냉동오징어", spec: "EA", cost: 4500, vatIncluded: false, quantity: 5 });
    const included = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "included").lines[0];
    expect(included.cost).toBeCloseTo(4090.91, 2);
  });

  it("merges duplicate items in one file and stores one receipt row per day/item", () => {
    const sheet = buildPurchaseSheet(matrix);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "excluded");
    const merged = mergeDuplicateLines(lines);
    expect(merged).toHaveLength(2);
    expect(merged.find((line) => line.name === "냉동오징어")).toMatchObject({ quantity: 7, rawCost: 4600 });
    const rows = buildPurchaseReceiptRows({ actorName: "대표", companyId: "c", fileName: "a.xlsx", lines, receiptDate: "2026-11-04" });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.product_name === "냉동오징어")).toMatchObject({ quantity: 7, supply_amount: 31700 });
  });

  it("matches existing products ignoring spaces and brackets so daily uploads do not create duplicates", () => {
    const products = [{ id: "p1", code: "", name: "냉동 오징어", spec: "EA", unit: "", cost: 4000 }];
    expect(matchCostImportRow({ code: "", name: "냉동오징어", spec: "[EA]", unit: "", supplier: "", cost: 4500 }, products)?.id).toBe("p1");
  });
});

describe("purchase import vat column", () => {
  it("treats prices as VAT-excluded and records taxable/exempt from a separate VAT column", () => {
    const sheet = buildPurchaseSheet([
      ["품목명", "수량", "단가", "공급가액", "부가세", "합계"],
      ["간장 [1.8L]", "2", "10000", "20000", "2000", "22000"],
      ["양파 [10kg]", "1", "15000", "15000", "", "15000"]
    ]);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "auto");
    expect(lines.map((line) => [line.taxType, line.vatIncluded, line.cost])).toEqual([["taxable", false, 10000], ["exempt", false, 15000]]);
    expect(buildPurchaseReceiptRows({ actorName: "대표", companyId: "c", fileName: "a", lines, receiptDate: "2026-11-04" })[0]).toMatchObject({ tax_type: "taxable", vat_amount: 2000 });
  });
});
