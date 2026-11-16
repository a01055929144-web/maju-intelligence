import { describe, expect, it, vi } from "vitest";
import { readPublicSalesQuote } from "../lib/sales/public-quote-read";

const token = "12345678-1234-1234-1234-123456789abc";

describe("public sales quote reads", () => {
  it("rejects invalid tokens without querying", async () => {
    const request = vi.fn();
    await expect(readPublicSalesQuote(request, "invalid", vi.fn(), () => false)).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the public token and company boundaries while excluding internal pricing fields", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce([{ company_id: "company/a", id: "quote/b", quote_number: "Q-1", recipient_name: "고객", title: "견적", valid_until: "2099-01-01" }])
      .mockResolvedValueOnce([{ name: "회사" }])
      .mockResolvedValueOnce([{ photo_url: "photo.jpg", product_name: "양파", quantity: 2, sales_unit_price: 1100, specification: null, supply_amount: null, tax_amount: null, tax_type_snapshot: "taxable", total_amount: null, unit: "망" }]);
    const signPhoto = vi.fn(async () => "signed-photo");

    const result = await readPublicSalesQuote(request, token, signPhoto, () => false);
    expect(request.mock.calls[0][0]).toContain(`public_token=eq.${token}`);
    expect(request.mock.calls[0][0]).toContain("public_enabled=eq.true");
    expect(request.mock.calls[2][0]).toContain("company_id=eq.company%2Fa");
    expect(request.mock.calls[2][0]).toContain("quote_id=eq.quote%2Fb");
    expect(request.mock.calls[2][0]).not.toMatch(/cost|margin/);
    expect(signPhoto).toHaveBeenCalledWith("company/a", "photo.jpg");
    expect(result).toMatchObject({ companyName: "회사", quoteNumber: "Q-1", total: 2420, taxableSupplyAmount: 2200, taxAmount: 220 });
  });

  it("returns null for a missing optional schema", async () => {
    const request = (async () => { throw new Error("missing schema"); }) as Parameters<typeof readPublicSalesQuote>[0];
    await expect(readPublicSalesQuote(request, token, vi.fn(), () => true)).resolves.toBeNull();
  });
});
