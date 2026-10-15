import { describe, expect, it } from "vitest";
import {
  buildCatalogPreview,
  buildSupplierProductWrite,
  convertedUnitCost,
  inferTaxType,
  parseProductText,
  planSupplierMatchRefresh,
  rankProductCandidates,
  scoreProductMatch,
  suggestCatalogMapping,
} from "../domains/product/catalog-import";
describe("catalog import", () => {
  it("maps spaced ERP headers", () =>
    expect(
      suggestCatalogMapping(["상  품  명", "규  격", "매입가"]),
    ).toMatchObject({
      productName: "상  품  명",
      spec: "규  격",
      cost: "매입가",
    }));
  it("parses attributes and usage", () =>
    expect(
      parseProductText("**돼지(대패삼겹/네덜란드산)", "1.4kg(b/6)"),
    ).toMatchObject({
      cleaned: "돼지(대패삼겹/네덜란드산)",
      origin: "네덜란드산",
      specValue: 1400,
      specUnit: "g",
      packQuantity: 6,
      usageTags: ["대패"],
    }));
  it("normalizes brand aliases, origin, liters, and prefixes", () =>
    expect(
      parseProductText("★씨제이 육수 국내산", "1.5L * 10개"),
    ).toMatchObject({
      brand: "CJ",
      cleaned: "씨제이 육수 국내산",
      origin: "국내산",
      specValue: 1500,
      specUnit: "ml",
      packQuantity: 10,
      usageTags: ["육수"],
    }));
  it("excludes return and total", () => {
    const p = buildCatalogPreview(
      [
        { 상품명: "양파", 수량: 1, 매입가: 1000 },
        { 상품명: "양파", 수량: -1, 매입가: 1 },
        { 상품명: "[합 계]", 매입가: 1 },
      ],
      { productName: "상품명", quantity: "수량", cost: "매입가" },
      "A",
    );
    expect(p.products).toHaveLength(1);
    expect(p.excludedCount).toBe(2);
  });
  it("recognizes accounting-format returns", () => {
    const p = buildCatalogPreview(
      [{ 상품명: "반품 두부", 수량: "(2)", 매입가: "1,000" }],
      { productName: "상품명", quantity: "수량", cost: "매입가" },
      "A",
    );
    expect(p.products).toHaveLength(0);
    expect(p.excluded["반품 행"]).toBe(1);
  });
  it("only autos exact five attributes", () => {
    const s = buildCatalogPreview(
      [{ 상품명: "CJ 두부 국내산", 규격: "1kg", 단위: "봉", 매입가: 1 }],
      { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가" },
      "A",
    ).products[0];
    expect(
      scoreProductMatch(s, {
        name: s.name,
        brand: s.brand,
        origin: s.origin,
        specValue: s.specValue,
        specUnit: s.specUnit,
        unit: s.unit,
      }).auto,
    ).toBe(true);
    expect(
      scoreProductMatch(s, {
        name: s.name,
        brand: s.brand,
        origin: s.origin,
        specValue: s.specValue,
        specUnit: s.specUnit,
        unit: "박스",
      }).auto,
    ).toBe(false);
  });
  it("preserves confirmed and auto matches while refreshing candidates", () => {
    const plan = planSupplierMatchRefresh(
      ["confirmed", "auto", "candidate"],
      [
        {
          supplierProductId: "confirmed",
          productCatalogId: "p1",
          matchStatus: "confirmed",
        },
        {
          supplierProductId: "auto",
          productCatalogId: "p2",
          matchStatus: "auto",
        },
        {
          supplierProductId: "candidate",
          productCatalogId: "p3",
          matchStatus: "candidate",
        },
        {
          supplierProductId: "candidate",
          productCatalogId: "p4",
          matchStatus: "rejected",
        },
      ],
    );
    expect([...plan.protectedSupplierIds]).toEqual(["confirmed", "auto"]);
    expect(plan.unresolvedSupplierIds).toEqual(["candidate"]);
    expect([...(plan.rejectedCatalogIds.get("candidate") || [])]).toEqual([
      "p4",
    ]);
  });
  it("updates only the supplier cost snapshot when a confirmed product is reimported", () => {
    const parsed = buildCatalogPreview(
      [{ 상품명: "두부", 상품코드: "ONE", 매입가: 1250 }],
      { productName: "상품명", productCode: "상품코드", cost: "매입가" },
      "supplier",
    ).products[0];
    const write = buildSupplierProductWrite("company", "supplier", parsed);
    expect(write).toMatchObject({
      latest_cost: 1250,
      cost_confirmed: true,
      source_fingerprint: "supplier:code:one",
    });
    const plan = planSupplierMatchRefresh(
      ["supplier-product"],
      [
        {
          supplierProductId: "supplier-product",
          productCatalogId: "catalog",
          matchStatus: "confirmed",
        },
      ],
    );
    expect(plan.unresolvedSupplierIds).toEqual([]);
  });
  it("keeps only three ranked candidates and excludes rejected catalog items", () => {
    const source = buildCatalogPreview(
      [{ 상품명: "CJ 두부 국내산", 규격: "1kg", 단위: "봉", 매입가: 1000 }],
      { productName: "상품명", spec: "규격", unit: "단위", cost: "매입가" },
      "supplier",
    ).products[0];
    const candidates = rankProductCandidates(
      source,
      ["a", "b", "c", "d"].map((id) => ({
        id,
        name: source.name,
        brand: source.brand,
        origin: source.origin,
        specValue: source.specValue,
        specUnit: source.specUnit,
        unit: source.unit,
      })),
      new Set(["a"]),
    );
    expect(candidates.map((candidate) => candidate.target.id)).toEqual([
      "b",
      "c",
      "d",
    ]);
  });
  it("infers tax type from VAT and supply amount", () => {
    expect(inferTaxType(0, 10_000)).toBe("exempt");
    expect(inferTaxType(1_000, 10_000)).toBe("taxable");
    expect(inferTaxType(300, 10_000)).toBeUndefined();
  });
  it("uses converted cost only after the ratio is confirmed", () => {
    expect(convertedUnitCost(10_000, 10, true)).toBe(1_000);
    expect(convertedUnitCost(10_000, 10, false)).toBeUndefined();
    expect(convertedUnitCost(10_000, 0, true)).toBeUndefined();
  });
});
