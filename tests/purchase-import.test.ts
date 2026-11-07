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
    const samePrice = matrix.map((row, index) => index === 4 ? ["냉동오징어 [EA]", "2", "4500", "9000", "", "9000"] : row);
    const sheet = buildPurchaseSheet(samePrice);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "excluded");
    const merged = mergeDuplicateLines(lines);
    expect(merged).toHaveLength(2);
    expect(merged.find((line) => line.name === "냉동오징어")).toMatchObject({ quantity: 7, rawCost: 4500 });
    const rows = buildPurchaseReceiptRows({ actorName: "대표", companyId: "c", fileName: "a.xlsx", lines, receiptDate: "2026-11-04" });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.product_name === "냉동오징어")).toMatchObject({ quantity: 7, supply_amount: 31500 });
  });

  it("returns undated duplicate prices as selection candidates instead of taking the last row", () => {
    const sheet = buildPurchaseSheet(matrix);
    const { lines } = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "excluded");
    const merged = mergeDuplicateLines(lines);
    expect(merged.some((line) => line.name === "냉동오징어")).toBe(false);
    expect(merged.conflicts[0]).toMatchObject({ name: "냉동오징어", purchaseDate: undefined });
    expect(merged.conflicts[0].candidates.map((line) => ({ cost: line.cost, rowNumber: line.rowNumber }))).toEqual([
      { cost: 4500, rowNumber: 3 },
      { cost: 4600, rowNumber: 5 }
    ]);
  });

  it("uses a purchase-date column per row and keeps different dates as separate prices", () => {
    const sheet = buildPurchaseSheet([
      ["품목명", "단가", "구매일"],
      ["양파 [10kg]", "12000", "2026.11.01"],
      ["양파 [10kg]", "13000", "2026-11-02"]
    ]);
    const mapping = suggestPurchaseMapping(sheet);
    const merged = mergeDuplicateLines(parsePurchaseLines(sheet, mapping, "excluded").lines);
    expect(mapping.purchaseDate).toBe(2);
    expect(merged.map((line) => [line.purchaseDate, line.cost])).toEqual([["2026-11-01", 12000], ["2026-11-02", 13000]]);
    expect(merged.conflicts).toEqual([]);
  });

  it("parses Excel serial dates and returns blank or invalid dated rows for confirmation", () => {
    const sheet = buildPurchaseSheet([
      ["품목명", "단가", "구매일"],
      ["양파", "12000", "45231"],
      ["대파", "3000", ""],
      ["마늘", "9000", "2026-13-01"],
      ["감자", "7000", "2026. 11. 1."],
      ["당근", "8000", "2026년 11월 2일"]
    ]);
    const parsed = parsePurchaseLines(sheet, suggestPurchaseMapping(sheet), "excluded");
    expect(parsed.lines.map((line) => line.purchaseDate)).toEqual(["2023-11-01", "2026-11-01", "2026-11-02"]);
    expect(parsed.dateIssues).toEqual([3, 4]);
    expect(parsed.lines.map((line) => line.name)).toEqual(["양파", "감자", "당근"]);
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
  it("fills a blank supplier and unit from a single catalog link without counting the same cost twice", async () => {
    const { mergePurchaseHistoryRows, resolvePurchaseHistoryRows, summarizePurchaseHistory } = await import("../domains/pricing/purchase-receipt");
    const receipt = { id: "receipt", product_catalog_id: "p1", line_key: "raw", product_name: "양파", receipt_date: "2026-11-05", spec: "10kg", unit: null, supplier_name: null, quantity: 3, unit_cost_ex_vat: 1200 };
    const supplier = { ...receipt, id: "supplier", line_key: "supplier-history", unit: "BOX", supplier_name: "기본 매입처", quantity: null };
    const normalized = resolvePurchaseHistoryRows([receipt], new Map([["p1", { supplier: "기본 매입처", unit: "BOX" }]]));
    const [item] = summarizePurchaseHistory(mergePurchaseHistoryRows(normalized, [supplier]));
    expect(item).toMatchObject({ supplier: "기본 매입처", unit: "BOX", spec: "10kg", count: 1, totalQuantity: 3 });
  });

  it("groups by item and computes latest/previous cost and quantity", async () => {
    const { summarizePurchaseHistory } = await import("../domains/pricing/purchase-receipt");
    const items = summarizePurchaseHistory([
      { line_key: "a|spec", product_name: "오징어", quantity: 5, receipt_date: "2026-11-03", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 4500 },
      { line_key: "a|spec", product_name: "오징어", quantity: 3, receipt_date: "2026-11-04", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 4950 }
    ]);
    expect(items[0]).toMatchObject({ count: 2, latestCost: 4950, lineKey: "a|spec", previousCost: 4500, changeAmount: 450, changeRate: 10, direction: "up", totalQuantity: 8 });
  });

  it("keeps an amount and direction when the previous cost is zero", async () => {
    const { summarizePurchaseHistory } = await import("../domains/pricing/purchase-receipt");
    const [item] = summarizePurchaseHistory([
      { line_key: "zero", product_name: "샘플", quantity: 1, receipt_date: "2026-11-03", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 0 },
      { line_key: "zero", product_name: "샘플", quantity: 1, receipt_date: "2026-11-04", spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: 100 }
    ]);
    expect(item).toMatchObject({ previousCost: 0, changeAmount: 100, changeRate: undefined, direction: "up" });
  });

  it("includes the previous changed cost when it falls beyond the page boundary", async () => {
    const { attachPurchaseHistoryPreviousCosts, summarizePurchaseHistory } = await import("../domains/pricing/purchase-receipt");
    const rows = Array.from({ length: 101 }, (_, index) => ({
      line_key: index === 0 || index === 100 ? "target" : `other-${index}`,
      product_name: index === 0 || index === 100 ? "대상" : `기타 ${index}`,
      quantity: 1,
      receipt_date: index === 0 ? "2026-11-05" : index === 100 ? "2026-11-01" : "2026-11-04",
      spec: null, supplier_name: null, unit: "EA", unit_cost_ex_vat: index === 100 ? 90 : 100
    }));
    const item = summarizePurchaseHistory(attachPurchaseHistoryPreviousCosts(rows, rows.slice(0, 100))).find((entry) => entry.lineKey === "target");
    expect(item).toMatchObject({ latestCost: 100, previousCost: 90, changeAmount: 10, direction: "up" });
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

describe("runLimited", () => {
  it("keeps order and limits concurrency", async () => {
    const { runLimited } = await import("../lib/run-limited");
    let running = 0;
    let peak = 0;
    const out = await runLimited([1, 2, 3, 4, 5], 2, async (value) => {
      running++; peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return value * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
