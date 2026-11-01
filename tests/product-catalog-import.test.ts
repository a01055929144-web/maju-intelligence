import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { createCatalogFromSupplierProducts } from "../lib/product-catalog-import";

describe("product catalog import data access", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("splits large supplier product filters into bounded requests", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `product-${index}`);
    supabaseRequest.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      createCatalogFromSupplierProducts("company-1", ids),
    ).resolves.toEqual({ createdCount: 0 });

    expect(supabaseRequest).toHaveBeenCalledTimes(2);
    const firstPath = supabaseRequest.mock.calls[0][0] as string;
    const secondPath = supabaseRequest.mock.calls[1][0] as string;
    expect(firstPath).toContain("id=in.(product-0,");
    expect(firstPath).toContain("product-99)");
    expect(firstPath).not.toContain("product-100");
    expect(secondPath).toContain("id=in.(product-100)");
  });
});
