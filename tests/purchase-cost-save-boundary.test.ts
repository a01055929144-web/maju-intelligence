import { expect, it, vi } from "vitest";
import { updatePurchaseCosts } from "../application/pricing/update-purchase-cost";

it("rejects a zero or negative current purchase price before any repository write", async () => {
  const save = vi.fn();
  const costs = updatePurchaseCosts({ list: vi.fn(), save });
  for (const cost of [0, -1]) {
    await expect(costs.save("company", "actor", [{ productId: "product", expectedCost: 100, cost }])).rejects.toThrow("0원 확인");
  }
  expect(save).not.toHaveBeenCalled();
});
