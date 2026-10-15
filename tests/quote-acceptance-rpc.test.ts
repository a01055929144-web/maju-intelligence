import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { invokeQuoteAcceptanceRpc } from "../lib/quote-acceptance";

describe("atomic quote acceptance RPC", () => {
  it("maps a normal acceptance result and calls only the atomic RPC", async () => {
    const request = vi.fn().mockResolvedValue({
      already_applied: false,
      applied_count: 3,
      pending_customer_conversion: false,
      tax_unconfirmed_count: 0,
      unlinked_count: 1
    });

    await expect(invokeQuoteAcceptanceRpc(request, {
      actorName: "정두영", companyId: "company-1", effectiveDate: "2026-10-16", quoteId: "quote-1"
    })).resolves.toEqual({
      alreadyApplied: false,
      appliedCount: 3,
      pendingCustomerConversion: false,
      taxUnconfirmedCount: 0,
      unlinkedCount: 1
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe("rpc/accept_sales_quote_and_apply_prices");
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toMatchObject({
      p_actor_name: "정두영",
      p_company_id: "company-1",
      p_quote_id: "quote-1"
    });
  });

  it("preserves the already-applied response for a repeated acceptance", async () => {
    const request = vi.fn().mockResolvedValue({ already_applied: true, applied_count: 0, pending_customer_conversion: false });
    await expect(invokeQuoteAcceptanceRpc(request, {
      companyId: "company-1", effectiveDate: "2026-10-16", quoteId: "quote-1"
    })).resolves.toMatchObject({
      alreadyApplied: true,
      appliedCount: 0,
      pendingCustomerConversion: false
    });
  });

  it("keeps tax-unconfirmed and unlinked counts in the API response", async () => {
    const request = vi.fn().mockResolvedValue({
      already_applied: false,
      applied_count: 1,
      pending_customer_conversion: false,
      tax_unconfirmed_count: 2,
      unlinked_count: 4
    });
    await expect(invokeQuoteAcceptanceRpc(request, {
      companyId: "company-1", effectiveDate: "2026-10-16", quoteId: "quote-1"
    })).resolves.toMatchObject({
      appliedCount: 1,
      taxUnconfirmedCount: 2,
      unlinkedCount: 4
    });
  });

  it("surfaces overlap failures without issuing compensating application writes", async () => {
    const request = vi.fn().mockRejectedValue(new Error("23P01 customer_price_agreements_no_overlap"));

    await expect(invokeQuoteAcceptanceRpc(request, {
      companyId: "company-1", effectiveDate: "2026-10-16", quoteId: "quote-1"
    })).rejects.toThrow("이미 적용 중인 계약 단가 기간과 겹칩니다");
    expect(request).toHaveBeenCalledOnce();
  });

  it("sets the converted quote customer before using the same RPC", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    const start = source.indexOf("async function applyAcceptedLeadQuotesAfterCustomerConversion");
    const end = source.indexOf("export type SalesKpiSnapshot", start);
    const conversionSource = source.slice(start, end);
    expect(conversionSource.indexOf("customer_id: customerId")).toBeLessThan(conversionSource.indexOf("acceptSalesQuoteWithRpc"));
    expect(conversionSource).not.toContain("applyQuoteContractPrices");
  });
});
