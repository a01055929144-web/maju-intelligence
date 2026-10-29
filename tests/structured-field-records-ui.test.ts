import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deliverySource = readFileSync("components/mobile-delivery-proof-panel.tsx", "utf8");
const salesSource = readFileSync("components/mobile-sales-workspace.tsx", "utf8");
const todayPageSource = readFileSync("app/mobile/today/page.tsx", "utf8");
const salesPageSource = readFileSync("app/mobile/sales/page.tsx", "utf8");

describe("structured record mobile flow wiring", () => {
  it("keeps delivery save and reopen behind the company flag", () => {
    expect(todayPageSource).toContain("structuredRecordsEnabled={areStructuredFieldRecordsEnabled(session.companyId)}");
    expect(deliverySource).toContain('structuredRecordsEnabled ? "/api/customer/structured-field-records" : "/api/customer-operations"');
    expect(deliverySource).toContain("kind=delivery&customerId=");
  });

  it("keeps sales offer save and reopen behind the company flag", () => {
    expect(salesPageSource).toContain("structuredRecordsEnabled={areStructuredFieldRecordsEnabled(session.companyId)}");
    expect(salesSource).toContain('usesStructuredOffer ? "/api/customer/structured-field-records"');
    expect(salesSource).toContain("kind=lead_sales_offer&leadId=");
    expect(salesSource).toContain("await openLead(selected)");
  });
});
