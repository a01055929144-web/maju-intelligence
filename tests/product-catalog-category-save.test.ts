import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { updateProductCatalogForAdmin } from "../lib/product-catalog-admin";

const company = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const actor = { name: "합성 관리자" };
const input = (category?: string) => ({ name: "합성 양파", purchaseUnit: "박스", salesUnit: "kg", purchasePrice: 1000, isActive: true, category });
const row = (category: string | null) => ({ id, product_code: "P-1", canonical_name: "합성 양파", purchase_unit: "박스", sales_unit: "kg", category, is_active: true, purchase_price: 1000, default_sales_price: null });

describe("product editor category save (CC-04)", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("stores the editor category in the same normalized form as the batch review and reads it back", async () => {
    supabaseRequest.mockResolvedValueOnce([row(null)]).mockResolvedValueOnce([row("농산 > 채소류 > 조미채소")]);
    const saved = await updateProductCatalogForAdmin(company, id, input("  농산>채소류 >조미채소 "), actor);
    const [path, init] = supabaseRequest.mock.calls[1];
    expect(path).toContain(`company_id=eq.${company}`);
    expect(JSON.parse(init.body).category).toBe("농산 > 채소류 > 조미채소");
    expect(saved.category).toBe("농산 > 채소류 > 조미채소");
  });

  it("clears an empty category instead of saving blanks", async () => {
    supabaseRequest.mockResolvedValueOnce([row("농산")]).mockResolvedValueOnce([row(null)]);
    await updateProductCatalogForAdmin(company, id, input(" > "), actor);
    expect(JSON.parse(supabaseRequest.mock.calls[1][1].body).category).toBeNull();
  });

  it("rejects a fourth level before reading or writing", async () => {
    await expect(updateProductCatalogForAdmin(company, id, input("가 > 나 > 다 > 라"), actor)).rejects.toThrow("3단계");
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
});
