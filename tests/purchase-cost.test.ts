import { describe, expect, it } from "vitest";
import { matchCostImportRow, parseCostImportRows, type CostProduct } from "../domains/pricing/purchase-cost";
import { updatePurchaseCosts } from "../application/pricing/update-purchase-cost";

const products: CostProduct[] = [
  { id: "a", code: "P-1", name: "양파", spec: "10kg", unit: "박스", cost: 10000, supplierCode: "ERP-1", supplierName: "유통사 A", supplierProductId: "supplier-a" },
  { id: "b", code: "P-2", name: "양파", spec: "5kg", unit: "박스", cost: 5000, supplierCode: "ERP-2", supplierName: "유통사 A" },
];

describe("purchase cost import", () => {
  it("matches ERP code first, then exact name and spec", () => {
    expect(matchCostImportRow({ code: "ERP-1", name: "다른 이름", spec: "", unit: "", supplier: "유통사 A", cost: 9000 }, products)?.id).toBe("a");
    expect(matchCostImportRow({ code: "", name: "양파", spec: "5kg", unit: "", supplier: "유통사 A", cost: 4000 }, products)?.id).toBe("b");
    expect(matchCostImportRow({ code: "", name: "양파", spec: "20kg", unit: "", supplier: "유통사 A", cost: 4000 }, products)).toBeNull();
    expect(matchCostImportRow({ code: "", name: "양파", spec: "10kg", unit: "", supplier: "", cost: 9000 }, [...products, { ...products[0], supplierName: "유통사 B", supplierProductId: "supplier-b" }])?.supplierProductId).toBeUndefined();
  });

  it("rejects an empty cost rather than treating it as zero", () => {
    expect(() => parseCostImportRows([{ 품목: "양파", 매입가: "" }], { code: "", name: "품목", spec: "", unit: "", supplier: "", cost: "매입가" })).toThrow("2행");
  });

  it("reports how many rows were saved before a later failure", async () => {
    let calls = 0;
    const action = updatePurchaseCosts({ list: async () => ({}), save: async () => { calls++; if (calls === 2) throw new Error("충돌"); } });
    await expect(action.save("company", "owner", [
      { productId: "a", expectedCost: 1, cost: 0.29 },
      { productId: "b", expectedCost: 2, cost: 3 },
    ])).rejects.toThrow("1개 저장됨 · 1개 미저장");
  });
});
