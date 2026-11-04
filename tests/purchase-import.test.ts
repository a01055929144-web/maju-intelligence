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
    expect(splitNameSpec("냉동오징어 [EA]", "")).toEqual({ name: "냉동오징어", spec: "", unit: "EA" });
    expect(splitNameSpec("껍질가리비 [180G*10EA]", "")).toEqual({ name: "껍질가리비", spec: "180G*10EA", unit: "" });
    const sheet = buildPurchaseSheet(matrix);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "auto");
    expect(lines[0]).toMatchObject({ name: "냉동오징어", spec: "", unit: "EA", cost: 4500, vatIncluded: false, quantity: 5 });
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

describe("product tax type fill", () => {
  it("fills only empty products and reports conflicts instead of overwriting", async () => {
    const { planProductTaxTypes } = await import("../domains/pricing/purchase-receipt");
    const line = { cost: 1, name: "a", rawCost: 1 };
    const plan = planProductTaxTypes(
      [
        { ...line, productId: "p1", taxType: "exempt" },
        { ...line, productId: "p2", taxType: "taxable" },
        { ...line, productId: "p3", taxType: "taxable" },
        { ...line, productId: "p3", taxType: "exempt" }
      ],
      new Map([["p1", null], ["p2", "exempt"], ["p3", null]])
    );
    expect(plan.fill).toEqual([{ productId: "p1", taxType: "exempt" }]);
    expect(plan.conflicts.sort()).toEqual(["p2", "p3"]);
  });
});

describe("product field edits", () => {
  it("splits spec and fills only missing product fields", async () => {
    const { buildProductFieldPatch, planMissingProductFields, splitSpec } = await import("../domains/pricing/purchase-receipt");
    expect(splitSpec("10kg")).toEqual({ spec_unit: "kg", spec_value: 10 });
    expect(splitSpec("EA")).toEqual({ spec_unit: "EA", spec_value: null });
    expect(buildProductFieldPatch({ name: " " })).toEqual({ error: "품목명은 비울 수 없습니다." });
    expect(buildProductFieldPatch({ unit: "박스", taxType: "exempt" })).toEqual({ values: { purchase_unit: "박스", sales_unit: "박스", tax_type: "exempt" } });
    const line = { cost: 1, name: "a", rawCost: 1 };
    const plan = planMissingProductFields(
      [{ ...line, productId: "p1", spec: "1.8L", unit: "병" }, { ...line, productId: "p2", spec: "5kg", unit: "박스" }],
      new Map([["p1", { spec: "", unit: "" }], ["p2", { spec: "10kg", unit: "박스" }]])
    );
    expect(plan).toEqual([{ productId: "p1", values: { purchase_unit: "병", sales_unit: "병", spec_unit: "L", spec_value: 1.8 } }]);
  });
});

describe("purchase history", () => {
  it("groups by item and computes latest/previous cost and quantity", async () => {
    const { summarizePurchaseHistory } = await import("../domains/pricing/purchase-receipt");
    const items = summarizePurchaseHistory([
      { line_key: "a", product_name: "오징어", quantity: 5, receipt_date: "2026-11-03", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 4500 },
      { line_key: "a", product_name: "오징어", quantity: 3, receipt_date: "2026-11-04", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 4950 }
    ]);
    expect(items[0]).toMatchObject({ count: 2, latestCost: 4950, previousCost: 4500, changeRate: 10, totalQuantity: 8 });
  });
});

describe("aliases and duplicate suspects", () => {
  it("matches by remembered raw text even after the product was renamed", async () => {
    const { aliasKey, matchByAlias } = await import("../domains/pricing/purchase-cost");
    const key = aliasKey("냉동오징어 [EA]", "", "EA");
    const products = [{ id: "p1", code: "", name: "오징어(냉동)", spec: "", unit: "EA", cost: 4000, supplierName: "기본 매입처", supplierRawKey: aliasKey("냉동오징어  [EA]", "", "ea") }];
    expect(matchByAlias(key, "", products)?.id).toBe("p1");
    expect(matchByAlias(aliasKey("냉동오징어 [KG]", "", "KG"), "", products)).toBeNull();
  });

  it("flags same-name different spec/unit and similar names", async () => {
    const { findDuplicateSuspects } = await import("../domains/pricing/purchase-cost");
    const products = [
      { id: "p1", code: "", name: "껍질가리비", spec: "180G*10EA", unit: "BOX", cost: 2000 },
      { id: "p2", code: "", name: "양파", spec: "10kg", unit: "망", cost: 9000 }
    ];
    const same = findDuplicateSuspects({ name: "껍질가리비", spec: "200G*10EA", unit: "BOX" }, products);
    expect(same[0]).toMatchObject({ productId: "p1" });
    expect(same[0].reason).toContain("규격 180G*10EA → 200G*10EA");
    expect(findDuplicateSuspects({ name: "껍질 가리비살", spec: "", unit: "KG" }, products)[0]?.productId).toBe("p1");
    expect(findDuplicateSuspects({ name: "대파", spec: "", unit: "단" }, products)).toEqual([]);
  });
});
