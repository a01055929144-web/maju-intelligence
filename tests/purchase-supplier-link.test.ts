import { describe, expect, it } from "vitest";
import { supplierLinkTargets, type CostProduct } from "../domains/pricing/purchase-cost";

const base = (id: string, name: string, spec: string, extra: Partial<CostProduct> = {}): CostProduct =>
  ({ id, code: "", name, spec, unit: "EA", cost: 1000, ...extra }) as CostProduct;

describe("supplierLinkTargets", () => {
  const products = [
    base("p1", "콘센트치킨스타", "1.2KG*6EA", { supplierName: "기본 매입처", supplierProductId: "s1" }),
    base("p2", "양파", "1KG", { supplierName: "새매입처", supplierProductId: "s2" }),
  ];
  const line = (rawName: string, name: string, spec: string, supplier: string) => ({ rawName, name, spec, unit: "", code: "", supplier, cost: 9818 });

  it("links an existing product to a supplier that is not linked yet, once per raw line", () => {
    const targets = supplierLinkTargets([
      line("콘센트치킨스타 [1.2KG*6EA]", "콘센트치킨스타", "1.2KG*6EA", "(주)가짜푸드"),
      line("콘센트치킨스타 [1.2KG*6EA]", "콘센트치킨스타", "1.2KG*6EA", "(주)가짜푸드"),
    ], products);
    expect(targets).toEqual([{ productId: "p1", rawName: "콘센트치킨스타 [1.2KG*6EA]", spec: "1.2KG*6EA", unit: "", cost: 9818, supplierName: "(주)가짜푸드" }]);
  });

  it("skips lines already linked to that supplier, lines without supplier, and lines with no existing product", () => {
    expect(supplierLinkTargets([
      line("양파 [1KG]", "양파", "1KG", "새매입처"),
      line("콘센트치킨스타", "콘센트치킨스타", "1.2KG*6EA", ""),
      line("처음보는품목", "처음보는품목", "", "(주)가짜푸드"),
    ], products)).toEqual([]);
  });
});
