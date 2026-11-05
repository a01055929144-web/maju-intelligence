import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { listProductCategorySuggestions, updateProductCategoriesForAdmin } from "../lib/product-catalog-admin";

describe("product category batch review", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("keeps every write in the authenticated company and reports partial failures", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "10000000-0000-4000-8000-000000000001", category: "농산 > 채소류" }])
      .mockRejectedValueOnce(new Error("temporary failure"));

    const results = await updateProductCategoriesForAdmin("company-a", [
      { id: "10000000-0000-4000-8000-000000000001", category: "농산 > 채소류", expectedCategory: "" },
      { id: "10000000-0000-4000-8000-000000000002", category: "수산 > 어류", expectedCategory: "" },
    ]);

    expect(results).toEqual([
      { id: "10000000-0000-4000-8000-000000000001", category: "농산 > 채소류", ok: true },
      { id: "10000000-0000-4000-8000-000000000002", message: "temporary failure", ok: false },
    ]);
    for (const [path] of supabaseRequest.mock.calls) {
      expect(path).toContain("company_id=eq.company-a");
    }
  });

  it("rejects oversized batches before writing", async () => {
    const updates = Array.from({ length: 51 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      category: "기타",
      expectedCategory: "",
    }));
    await expect(updateProductCategoriesForAdmin("company-a", updates)).rejects.toThrow("1~50개");
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("pages through a 741-item company catalog without crossing company scope", async () => {
    const rows = Array.from({ length: 741 }, (_, index) => ({
      id: `product-${index}`,
      canonical_name: `양파 ${index}`,
      category: null,
    }));
    supabaseRequest
      .mockResolvedValueOnce(rows.slice(0, 200))
      .mockResolvedValueOnce(rows.slice(200, 400))
      .mockResolvedValueOnce(rows.slice(400, 600))
      .mockResolvedValueOnce(rows.slice(600));

    let candidateCount = 0;
    for (let page = 1; ; page += 1) {
      const result = await listProductCategorySuggestions("company-a", page);
      candidateCount += result.candidates.length;
      if (!result.hasMore) break;
    }
    expect(candidateCount).toBe(741);
    expect(supabaseRequest).toHaveBeenCalledTimes(4);
    expect(supabaseRequest.mock.calls[3][0]).toContain("company_id=eq.company-a");
    expect(supabaseRequest.mock.calls[3][0]).toContain("offset=600");
  });

  it("limits database writes to five concurrent rows", async () => {
    let active = 0, maximum = 0;
    supabaseRequest.mockImplementation(async (path: string) => {
      active += 1; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return [{ id: path, category: "기타" }];
    });
    const results = await updateProductCategoriesForAdmin("company-a", Array.from({ length: 12 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      category: "기타",
      expectedCategory: "",
    })));
    expect(results).toHaveLength(12);
    expect(maximum).toBe(5);
  });

  it("does not overwrite a category changed after preview", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const [result] = await updateProductCategoriesForAdmin("company-a", [{
      id: "10000000-0000-4000-8000-000000000001",
      category: "수산 > 어류",
      expectedCategory: "축산 > 우육",
    }]);
    expect(supabaseRequest.mock.calls[0][0]).toContain("category=eq.%EC%B6%95%EC%82%B0%20%3E%20%EC%9A%B0%EC%9C%A1");
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("다른 사용자") });
  });
});
