import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { createCatalogFromSupplierProducts } from "../lib/product-catalog-import";

describe("product catalog import data access", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("splits supplier product and source key filters into bounded requests", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `product-${index}`);
    const products = ids.map((id) => ({ id }));
    const catalog = ids.map((id) => ({
      id: `catalog-${id}`,
      source_key: `standard:${id}`,
    }));
    supabaseRequest
      .mockResolvedValueOnce(products.slice(0, 100))
      .mockResolvedValueOnce(products.slice(100))
      .mockResolvedValueOnce(catalog.slice(0, 100))
      .mockResolvedValueOnce(catalog.slice(100));

    await expect(
      createCatalogFromSupplierProducts("company-1", ids),
    ).resolves.toEqual({ createdCount: 0 });

    expect(supabaseRequest).toHaveBeenCalledTimes(5);
    const supplierPaths = supabaseRequest.mock.calls
      .slice(0, 2)
      .map((call) => call[0] as string);
    expect(supplierPaths[0]).toContain("id=in.(product-0,");
    expect(supplierPaths[0]).toContain("product-99)");
    expect(supplierPaths[0]).not.toContain("product-100");
    expect(supplierPaths[1]).toContain("id=in.(product-100)");

    const sourceKeyPaths = supabaseRequest.mock.calls
      .slice(2, 4)
      .map((call) => call[0] as string);
    expect(sourceKeyPaths[0]).toContain("source_key=in.(standard%3Aproduct-0,");
    expect(sourceKeyPaths[0]).toContain("standard%3Aproduct-99)");
    expect(sourceKeyPaths[0]).not.toContain("standard%3Aproduct-100");
    expect(sourceKeyPaths[1]).toContain(
      "source_key=in.(standard%3Aproduct-100)",
    );
    expect(supabaseRequest.mock.calls[4][0]).toContain(
      "supplier_product_matches?on_conflict=",
    );
  });
});
