import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { createAndPostStocktake, listInventory, listInventoryIssues, listUnitConversions, searchStocktakeProducts } from "../lib/inventory";

describe("inventory data access", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("pages balances from inventory_balances instead of loading the full catalog", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    await listInventory("company-1", { search: "두부", filter: "negative" });
    const path = supabaseRequest.mock.calls[0][0] as string;
    expect(path).toContain("inventory_balances?");
    expect(path).toContain("limit=101");
    expect(path).toContain("on_hand_quantity=lt.0");
    expect(path).toContain("product_catalog.or=");
    expect(path).not.toContain("limit=5000");
  });

  it("loads conversions only after a product is selected", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    await listUnitConversions("company-1", { search: "계란" });
    expect(supabaseRequest).toHaveBeenCalledTimes(1);
    expect(supabaseRequest.mock.calls[0][0]).toContain("limit=50");

    supabaseRequest.mockReset();
    supabaseRequest.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await listUnitConversions("company-1", { productId: "product-1" });
    expect(supabaseRequest).toHaveBeenCalledTimes(2);
    expect(supabaseRequest.mock.calls[1][0]).toContain("product_catalog_id=eq.product-1");
  });

  it("filters tracked inventory before balance pagination", async () => {
    supabaseRequest.mockResolvedValueOnce([{ product_catalog_id: "product-1", tracking_enabled: true, safety_stock_quantity: 0 }]).mockResolvedValueOnce([]);
    await listInventory("company-1", { filter: "tracked" });
    expect(supabaseRequest.mock.calls[0][0]).toContain("tracking_enabled=eq.true");
    expect(supabaseRequest.mock.calls[1][0]).toContain("product_catalog_id=in.(product-1)");
  });

  it("searches the catalog for first stocktake products and treats missing balances as zero", async () => {
    supabaseRequest.mockResolvedValueOnce([{ id: "product-1", product_code: "P-1", canonical_name: "두부", purchase_product_name: "두부", sales_unit: "모" }]).mockResolvedValueOnce([]);
    await expect(searchStocktakeProducts("company-1", "두부")).resolves.toEqual([{ id: "product-1", code: "P-1", name: "두부", baseUnit: "모", onHand: 0 }]);
    expect(supabaseRequest.mock.calls[0][0]).toContain("limit=50");
  });

  it("limits inventory issue scanning to recent pages", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const result = await listInventoryIssues("company-1", 2);
    expect(result).toEqual({ items: [], hasMore: false, nextPage: null });
    const path = supabaseRequest.mock.calls[0][0] as string;
    expect(path).toContain("limit=51");
    expect(path).toContain("offset=100");
    expect(path).toContain("document_date=gte.");
  });

  it("deletes a draft stocktake header when line insertion fails", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "stocktake-1" }])
      .mockRejectedValueOnce(new Error("line failure"))
      .mockResolvedValueOnce(null);
    await expect(createAndPostStocktake("company-1", {
      countedOn: "2026-10-16",
      reason: "정기 실사",
      lines: [{ productId: "product-1", countedQuantity: 3 }],
    }, "운영자")).rejects.toThrow("line failure");
    expect(supabaseRequest).toHaveBeenLastCalledWith(
      "inventory_stocktakes?company_id=eq.company-1&id=eq.stocktake-1&status=eq.draft",
      { method: "DELETE" },
    );
  });
});
