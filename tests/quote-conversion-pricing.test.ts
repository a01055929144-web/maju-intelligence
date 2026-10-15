import { describe, expect, it, vi } from "vitest";
import { applyAcceptedQuotePricesAfterConversion } from "../lib/quote-conversion-pricing";

describe("accepted quote pricing after customer conversion", () => {
  it("reports failures and keeps the converted quote eligible for the next retry", async () => {
    const quote = { customer_id: null as string | null, id: "quote-1" };
    const queries: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      queries.push(path);
      if (init?.method === "PATCH") quote.customer_id = "customer-1";
      return path.startsWith("sales_quotes?select") ? [quote] : undefined;
    });
    const acceptQuote = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ appliedCount: 1 });

    await expect(applyAcceptedQuotePricesAfterConversion({
      acceptQuote,
      companyId: "company-1",
      customerId: "customer-1",
      leadId: "lead-1",
      request
    })).resolves.toEqual({ pricingAppliedCount: 0, pricingFailedCount: 1 });

    await expect(applyAcceptedQuotePricesAfterConversion({
      acceptQuote,
      companyId: "company-1",
      customerId: "customer-1",
      leadId: "lead-1",
      request
    })).resolves.toEqual({ pricingAppliedCount: 1, pricingFailedCount: 0 });

    expect(queries.filter((path) => path.startsWith("sales_quotes?select"))).toHaveLength(2);
    expect(queries[0]).toContain("pricing_applied_at=is.null");
    expect(queries[0]).toContain("or=(customer_id.is.null,customer_id.eq.customer-1)");
    expect(request.mock.calls.filter((call) => call[1]?.method === "PATCH")).toHaveLength(1);
  });

  it("returns applied and failed counts across multiple accepted quotes", async () => {
    const request = vi.fn().mockResolvedValue([
      { customer_id: "customer-1", id: "quote-ok" },
      { customer_id: "customer-1", id: "quote-failed" }
    ]);
    const acceptQuote = vi.fn(async (quoteId: string) => {
      if (quoteId === "quote-failed") throw new Error("overlap");
    });

    await expect(applyAcceptedQuotePricesAfterConversion({
      acceptQuote,
      companyId: "company-1",
      customerId: "customer-1",
      leadId: "lead-1",
      request
    })).resolves.toEqual({ pricingAppliedCount: 1, pricingFailedCount: 1 });
  });
});
