import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { saveCategoryMatch, scoreCategoryMatch } from "../lib/product-category-match";

describe("category match suggestion", () => {
  beforeEach(() => supabaseRequest.mockReset());
  it("prefers exact names and adds an industry hint", () => {
    expect(scoreCategoryMatch("채소", "채소", "종합 식자재", ["식자재"])).toBe(100);
    expect(scoreCategoryMatch("신선 채소", "채소")).toBe(70);
    expect(scoreCategoryMatch("기타", "육류", "축산 유통", ["축산"])).toBe(30);
  });

  it("scopes the saved mapping to the authenticated company category", async () => {
    supabaseRequest.mockResolvedValueOnce([{ id: "category-1", maju_category_id: "maju-1" }]);
    await expect(saveCategoryMatch("company-1", "category-1", "maju-1")).resolves.toEqual({ id: "category-1", majuCategoryId: "maju-1" });
    expect(supabaseRequest).toHaveBeenCalledWith(
      "product_categories?select=id,maju_category_id&company_id=eq.company-1&id=eq.category-1",
      { method: "PATCH", body: JSON.stringify({ maju_category_id: "maju-1" }) },
    );
  });
});
