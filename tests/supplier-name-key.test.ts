import { describe, expect, it } from "vitest";
import { resolveExistingSupplierName, supplierNameKey } from "../domains/pricing/supplier-name";
import { matchCostImportRow, type CostProduct } from "../domains/pricing/purchase-cost";

describe("supplierNameKey", () => {
  it("treats corporate marks and spacing as the same company", () => {
    const key = supplierNameKey("(주)가짜푸드코리아");
    for (const name of ["㈜가짜푸드코리아", "주식회사 가짜푸드코리아", "가짜푸드코리아(주)", " 가짜 푸드코리아 "]) expect(supplierNameKey(name)).toBe(key);
    expect(supplierNameKey("유한회사 가짜상사")).toBe(supplierNameKey("(유)가짜상사"));
    expect(supplierNameKey("가짜푸드")).not.toBe(key);
  });

  it("reuses an already registered supplier name", () => {
    expect(resolveExistingSupplierName("주식회사 가짜푸드코리아", ["기본 매입처", "(주)가짜푸드코리아"])).toBe("(주)가짜푸드코리아");
    expect(resolveExistingSupplierName("새거래처", ["기본 매입처"])).toBe("새거래처");
  });

  it("matches products linked under another corporate spelling", () => {
    const products = [{ id: "p1", code: "", name: "양파", spec: "1KG", unit: "EA", cost: 1, supplierName: "(주)가짜푸드코리아", supplierProductId: "s1" }] as CostProduct[];
    expect(matchCostImportRow({ code: "", name: "양파", spec: "1KG", unit: "", supplier: "주식회사 가짜푸드코리아", cost: 1 }, products)?.supplierProductId).toBe("s1");
  });
});
