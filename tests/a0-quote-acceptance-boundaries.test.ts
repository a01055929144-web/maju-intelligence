import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("A-0 quote acceptance access boundaries", () => {
  it("keeps staff proxy acceptance behind company scope and manage_sales", () => {
    const route = source("app/api/sales-quotes/[id]/accept/route.ts");

    expect(route).toContain("getRequestAuthScope(request)");
    expect(route).toContain('scopeHasCapability(scope, "manage_sales")');
    expect(route).toContain("acceptSalesQuote(scope.companyId!, id");
  });

  it("keeps the legacy public quote read token-scoped and company-scopes its lines", () => {
    const store = source("lib/store.ts");
    const start = store.indexOf("export async function getPublicSalesQuote");
    const end = store.indexOf("export type CustomerContractPrice", start);
    const publicQuote = store.slice(start, end);

    expect(publicQuote).toContain("public_token=eq.${encodeURIComponent(publicToken)}");
    expect(publicQuote).toContain("public_enabled=eq.true");
    expect(publicQuote).toContain("valid_until=gt.${encodeURIComponent(new Date().toISOString())}");
    expect(publicQuote).toContain("company_id=eq.${encodeURIComponent(quote.company_id)}");
    expect(publicQuote).toContain("quote_id=eq.${encodeURIComponent(quote.id)}");
  });

  it("keeps store-link issuance behind flags, company scope and document access", () => {
    const route = source("app/api/pricing-store-links/route.ts");

    expect(route).toContain("priceSheetsEnabled()");
    expect(route).toContain("storeOrderingEnabled()");
    expect(route).toContain('isFeatureEnabled("PRICING", auth.companyId)');
    expect(route).toContain('isFeatureEnabled("STORE_ORDERING", auth.companyId)');
    expect(route).toContain("getRequestAuthScope(request, companyId)");
    expect(route).toContain("accessibleVersions(company, actor");
    expect(route).toContain("normalized_customers?company_id=eq.${encodeURIComponent(company)}");
    expect(route).toContain("pricing_document_versions?company_id=eq.${encodeURIComponent(company)}");
  });

  it.todo("accepts a lead-marked sheet link only for its token company and linked lead");
  it.todo("requires store name, contact and address for an unmarked public sheet link");
  it.todo("matches or creates a lead only inside the token company");
  it.todo("uses one idempotent acceptance path for sheet and quote without duplicate customers");
  it.todo("records staff proxy acceptance with the authenticated company and actor");
  it.todo("lets only an active store owner invite or export a store employee");
  it.todo("lets an active store employee order but not change payment or store information");
  it.todo("moves ownership only from the current owner or an authorized distributor actor after business-number verification");
  it.todo("blocks an exported member immediately while preserving historical order attribution");
  it.todo("records ordered_by_member_id only for an active member of the token store and company");
  it.todo("accepts store signup only after required terms and an active NTS business-status result");
});
