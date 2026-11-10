import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const draft = readFileSync(
  "docs/sql-drafts/20261110-03-lead-customer-mismatch-order-hold.sql",
  "utf8",
);
const pg17 = readFileSync(
  "docs/sql-drafts/20261102-S2-sales-to-order-acceptance.pg17.test.sql",
  "utf8",
);

describe("lead customer mismatch order hold SQL", () => {
  it("keeps the corrective SQL as an approval-gated draft", () => {
    expect(draft).toMatch(/^-- DRAFT ONLY/);
    expect(draft).toContain("Do not apply to an operating database");
  });

  it("returns a review result before pricing or storefront activation", () => {
    expect(draft).toContain("v_review_reason:='lead_customer_mismatch'");
    expect(draft).toContain("'needsReview',true,'orderEnabled',false");
    expect(draft.indexOf("return r.result;")).toBeLessThan(
      draft.indexOf("execute replace"),
    );
  });

  it("locks the existing lead link and absence of new order state in PG17", () => {
    expect(pg17).toContain("matched_customer_id from business_permit_leads");
    expect(pg17).toContain("count(*) from customer_pricing_document_links");
    expect(pg17).toContain("count(*) from customer_price_agreements");
    expect(pg17).toContain("a->>'orderEnabled'<>'false'");
    expect(pg17).toContain("can_order from storefront_links");
  });
});
