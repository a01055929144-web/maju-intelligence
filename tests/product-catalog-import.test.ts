import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import {
  createCatalogFromSupplierProducts,
  listProductImportWorkspace,
} from "../lib/product-catalog-import";

describe("product catalog import data access", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("creates the first standard product with imported cost and a confirmed match", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{
        id: "supplier-product-1", raw_name: "샘플", raw_unit: "EA",
        latest_cost: 18_910, cost_confirmed: true, parsed_tax_type: "taxable",
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce("P-000001")
      .mockResolvedValueOnce([{ id: "catalog-1", source_key: "standard:supplier-product-1" }])
      .mockResolvedValueOnce(undefined);

    await expect(createCatalogFromSupplierProducts("company-1", ["supplier-product-1"]))
      .resolves.toEqual({ createdCount: 1 });
    const catalog = JSON.parse(supabaseRequest.mock.calls[3][1].body);
    expect(catalog[0]).toMatchObject({
      product_code: "P-000001", purchase_price: 18_910, tax_type: "taxable",
    });
    const matches = JSON.parse(supabaseRequest.mock.calls[4][1].body);
    expect(matches[0]).toMatchObject({ product_catalog_id: "catalog-1", match_status: "confirmed" });
  });

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

  it("reuses the approved product import history for the audit list", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "supplier-1", name: "샘플상사" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "import-1",
          supplier_id: "supplier-1",
          file_name: "sample.xlsx",
          status: "completed",
          total_rows: 10,
          created_count: 6,
          updated_count: 3,
          excluded_count: 1,
          warning_count: 2,
          created_by_name: "테스트 관리자",
          created_at: "2026-11-02T00:00:00.000Z",
          completed_at: "2026-11-02T00:01:00.000Z",
          error_message: null,
        },
      ]);

    const workspace = await listProductImportWorkspace("company-1");

    expect(workspace.imports).toEqual([
      expect.objectContaining({
        id: "import-1",
        supplierName: "샘플상사",
        totalRows: 10,
        warningCount: 2,
      }),
    ]);
    expect(supabaseRequest.mock.calls[4][0]).toContain(
      "product_catalog_imports?select=",
    );
    expect(supabaseRequest.mock.calls[4][0]).not.toContain("import_jobs");
  });
});
