import { describe, expect, it } from "vitest";
import { findDuplicateSuspects, matchCostImportRow, parseCostImportRows, type CostProduct } from "../domains/pricing/purchase-cost";
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

  it("keeps capacity and grade variants separate and pending review", () => {
    const variants: CostProduct[] = [
      { id: "1.8l", code: "", name: "미림", spec: "1.8L", unit: "병", cost: 3000 },
      { id: "18l", code: "", name: "미림 18L", spec: "", unit: "통", cost: 20000 },
      { id: "500ml", code: "", name: "미림", spec: "500ml", unit: "병", cost: 1200 },
      { id: "normal", code: "", name: "사과 정상", spec: "10kg", unit: "박스", cost: 30000 },
      { id: "b", code: "", name: "사과 B급", spec: "10kg", unit: "박스", cost: 18000 }
    ];
    const row = (name: string, spec = "", unit = "") => ({ code: "", name, spec, unit, supplier: "", cost: 1 });

    expect(matchCostImportRow(row("미림 1.8L", "", "병"), variants)?.id).toBe("1.8l");
    expect(matchCostImportRow(row("미림 18L", "", "병"), variants)?.id).toBe("18l");
    expect(matchCostImportRow(row("미림 500ml", "", "병"), variants)?.id).toBe("500ml");
    expect(matchCostImportRow(row("미림 5L", "", "병"), variants)).toBeNull();
    expect(matchCostImportRow(row("사과 정상", "10kg", "박스"), variants)?.id).toBe("normal");
    expect(matchCostImportRow(row("사과 B급", "10kg", "박스"), variants)?.id).toBe("b");
    expect(findDuplicateSuspects(row("미림 5L", "", "병"), variants)[0]?.reason).toContain("규격이 다른 상품");
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
