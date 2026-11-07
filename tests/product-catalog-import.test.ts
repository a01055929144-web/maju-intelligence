import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import {
  createCatalogFromSupplierProducts,
  listProductImportWorkspace,
  saveProductCatalogImport,
  type SupplierProductAdminItem,
} from "../lib/product-catalog-import";
import { defaultConversionReviewRatio } from "../lib/product-conversion-review";

describe("product catalog import data access", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("suggests 1:1 only when the supplier and basic units match", () => {
    const item = {
      id: "supplier-product-1", supplierId: "supplier-1", supplierName: "샘플상사",
      rawName: "양파", rawUnit: "EA", latestCost: 100, costConfirmed: true,
      matchStatus: "confirmed", matchedCatalogId: "catalog-1",
      matchedCatalogUnit: "ea", suggestedRatio: 20, conversionConfirmed: false,
    } satisfies SupplierProductAdminItem;
    expect(defaultConversionReviewRatio(item)).toBe("1");
    expect(defaultConversionReviewRatio({ ...item, matchedCatalogUnit: "kg" })).toBe("");
    expect(defaultConversionReviewRatio({ ...item, matchedCatalogUnit: undefined })).toBe("");
  });

  it("creates the first standard product with imported cost and a confirmed match", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{
        id: "supplier-product-1", raw_name: "양파", raw_unit: "EA",
        latest_cost: 18_910, cost_confirmed: true, parsed_tax_type: "taxable",
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce("P-000001")
      .mockResolvedValueOnce([{ id: "catalog-1", source_key: "standard:supplier-product-1" }])
      .mockResolvedValueOnce(undefined);

    await expect(createCatalogFromSupplierProducts("company-1", ["supplier-product-1"]))
      .resolves.toEqual({
        categorySuggestedCount: 1,
        createdCount: 1,
        productMappings: [{ productCatalogId: "catalog-1", supplierProductId: "supplier-product-1" }],
        unresolvedSupplierProductIds: [],
      });
    const catalog = JSON.parse(supabaseRequest.mock.calls[3][1].body);
    expect(catalog[0]).toMatchObject({
      product_code: "P-000001", purchase_price: 18_910, tax_type: "taxable",
    });
    expect(catalog[0]).not.toHaveProperty("category");
    const matches = JSON.parse(supabaseRequest.mock.calls[4][1].body);
    expect(matches[0]).toMatchObject({ product_catalog_id: "catalog-1", match_status: "confirmed" });
  });

  it("returns the source fingerprint to supplier product ID contract", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "supplier-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "import-1" }])
      .mockResolvedValueOnce([{ id: "supplier-product-1", source_fingerprint: "supplier:name:onion||ea" }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);

    const result = await saveProductCatalogImport({
      companyId: "company-1", createdByName: "대표", excludedCount: 0, fileName: "purchase.xlsx",
      mapping: { cost: "매입가", productName: "상품명" }, supplierName: "supplier", warnings: [],
      products: [{ cost: 100, costConfirmed: true, name: "onion", observations: [], rawName: "onion", rawUnit: "EA", sourceFingerprint: "supplier:name:onion||ea", unit: "EA", usageTags: [] }],
    });

    expect(result.supplierProductMappings).toEqual([{ sourceFingerprint: "supplier:name:onion||ea", supplierProductId: "supplier-product-1" }]);
    expect(result.unresolvedSourceFingerprints).toEqual([]);
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
    ).resolves.toEqual({
      categorySuggestedCount: 0,
      createdCount: 0,
      productMappings: ids.map((id) => ({ productCatalogId: `catalog-${id}`, supplierProductId: id })),
      unresolvedSupplierProductIds: [],
    });

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

  it("returns exact IDs for 745 first-import products without creating duplicate standards", async () => {
    const ids = Array.from({ length: 745 }, (_, index) => `supplier-${index}`);
    const products = ids.map((id) => ({ id, raw_name: id, raw_unit: "EA", latest_cost: 100 }));
    let code = 0;
    supabaseRequest.mockImplementation(async (path: string, init?: { body?: string; method?: string }) => {
      const target = String(path || "");
      if (target.startsWith("supplier_products?select=")) {
        const requested = decodeURIComponent(target.match(/id=in\.\(([^)]+)\)/)?.[1] || "").split(",");
        return products.filter((product) => requested.includes(product.id));
      }
      if (target.startsWith("product_catalog?select=id,source_key")) return [];
      if (target === "rpc/next_product_code") return `P-${String(++code).padStart(6, "0")}`;
      if (target.startsWith("product_catalog?on_conflict=")) {
        return JSON.parse(init?.body || "[]").map((row: { source_key: string }) => ({ id: `catalog-${row.source_key.slice("standard:".length)}`, source_key: row.source_key }));
      }
      return undefined;
    });

    const result = await createCatalogFromSupplierProducts("company-1", ids);

    expect(result.createdCount).toBe(745);
    expect(result.productMappings).toHaveLength(745);
    expect(new Set(result.productMappings.map((mapping) => mapping.productCatalogId)).size).toBe(745);
    expect(result.unresolvedSupplierProductIds).toEqual([]);
    expect(supabaseRequest.mock.calls.filter(([path]) => String(path).startsWith("product_catalog?on_conflict=")).length).toBe(3);
  });

  it("reports requested supplier products that cannot be resolved", async () => {
    supabaseRequest.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(createCatalogFromSupplierProducts("company-1", ["missing", "missing"]))
      .resolves.toMatchObject({ productMappings: [], unresolvedSupplierProductIds: ["missing"] });
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

  it("shows the matched catalog basic unit for human conversion review", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: "supplier-1", name: "샘플상사" }])
      .mockResolvedValueOnce([{ id: "supplier-product-1", supplier_id: "supplier-1", raw_name: "양파", raw_unit: "BOX" }])
      .mockResolvedValueOnce([{ supplier_product_id: "supplier-product-1", product_catalog_id: "catalog-1", match_status: "confirmed", conversion_confirmed: false }])
      .mockResolvedValueOnce([{ id: "catalog-1", canonical_name: "양파", sales_unit: "EA" }])
      .mockResolvedValueOnce([]);
    const workspace = await listProductImportWorkspace("company-1");
    expect(workspace.items[0]).toMatchObject({ rawUnit: "BOX", matchedCatalogUnit: "EA", conversionConfirmed: false });
    expect(supabaseRequest.mock.calls[3][0]).toContain("sales_unit");
  });
});
