import { describe, expect, it, vi } from "vitest";
import { getCustomerContractPrice, listCustomerContractPrices } from "../lib/pricing/customer-contract-price-read";

describe("customer contract price reads", () => {
  it("keeps company and customer filters and maps catalog display fields", async () => {
    const requestMock = vi.fn(async () => [{
      effective_from: "2026-11-01",
      effective_until: null,
      id: "agreement-1",
      product_catalog_id: "product-1",
      product_catalog: { product_code: "P-1", sales_product_name: "판매 양파", purchase_product_name: "매입 양파" },
      sales_unit: "망",
      source_quote_id: "quote-1",
      status: "active",
      tax_type: "taxable",
      unit_price: "12500"
    }]);
    const request = requestMock as unknown as Parameters<typeof listCustomerContractPrices>[0];

    await expect(listCustomerContractPrices(request, "company/a", "customer/b")).resolves.toEqual([{
      effectiveFrom: "2026-11-01",
      effectiveUntil: undefined,
      id: "agreement-1",
      productCatalogId: "product-1",
      productCode: "P-1",
      productName: "판매 양파",
      salesUnit: "망",
      sourceQuoteId: "quote-1",
      status: "active",
      taxType: "taxable",
      unitPrice: 12500
    }]);
    expect(requestMock).toHaveBeenCalledWith(expect.stringContaining("company_id=eq.company%2Fa"));
    expect(requestMock).toHaveBeenCalledWith(expect.stringContaining("customer_id=eq.customer%2Fb"));
  });

  it("queries one active agreement inside the requested effective date", async () => {
    const requestMock = vi.fn(async () => [{ id: "agreement-1", sales_unit: "박스", tax_type: "exempt", unit_price: "9000" }]);
    const request = requestMock as unknown as Parameters<typeof getCustomerContractPrice>[0];

    await expect(getCustomerContractPrice(request, "company", "customer", "product", "2026-11-16")).resolves.toEqual({
      id: "agreement-1",
      salesUnit: "박스",
      taxType: "exempt",
      unitPrice: 9000
    });
    const path = requestMock.mock.calls[0][0];
    expect(path).toContain("status=eq.active");
    expect(path).toContain("effective_from=lte.2026-11-16");
    expect(path).toContain("or=(effective_until.is.null,effective_until.gte.2026-11-16)");
    expect(path).toContain("limit=1");
  });

  it("returns null when no effective agreement exists", async () => {
    const request = (async () => []) as Parameters<typeof getCustomerContractPrice>[0];
    await expect(getCustomerContractPrice(request, "company", "customer", "product", "2026-11-16")).resolves.toBeNull();
  });
});
