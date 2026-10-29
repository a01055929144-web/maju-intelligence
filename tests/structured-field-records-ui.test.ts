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

  it("shows the latest delivery record separately without restoring it into a new report", () => {
    const reopen = deliverySource.slice(deliverySource.indexOf("const structuredController = new AbortController()"), deliverySource.indexOf("const savedContactMode"));
    expect(reopen).toContain('setDeliveryStatus("arrived")');
    expect(reopen).toContain('setItemName("")');
    expect(reopen).toContain("setRecentStructuredDelivery((payload?.record");
    expect(reopen).not.toMatch(/set(?:DeliveryStatus|IssueCause|ItemName|ItemQuantity|SupplierName|OccurrenceStage|DeliveryAction|ActionAmount|EventStatus)\(record\./);
    expect(deliverySource).toContain('aria-label="최근 구조화 배송 기록"');
    expect(deliverySource).toContain("최근 기록 · 읽기 전용");
    expect(deliverySource).toContain("saveProgressRef.current = null;");
    const submit = deliverySource.slice(deliverySource.indexOf("async function submit()"), deliverySource.indexOf("async function retryMessage"));
    expect(submit).not.toContain("recentStructuredDelivery");
  });

  it("opens a fresh sales form even when a prior offer exists and after a successful save", () => {
    const reopen = salesSource.slice(salesSource.indexOf("const openLead = useCallback"), salesSource.indexOf("async function saveBusinessHours"));
    for (const setter of ["setSampleItem", "setSampleQuantity", "setSalesPriceItem", "setSalesPrice", "setSalesPriceValidUntil", "setImportantNote"]) {
      expect(reopen).toContain(`${setter}("")`);
      expect(reopen).not.toMatch(new RegExp(`${setter}\\((?:sample|priced|record)\\.`));
    }
    expect(reopen).toContain("setRecentStructuredOffer((structuredPayload?.record");
    expect(salesSource).toContain('aria-label="최근 구조화 영업 기록"');
    expect(salesSource).toMatch(/structuredSaveAttemptRef\.current = null;\s+if \(usesStructuredOffer\) \{\s+await openLead\(selected\);/);
    const save = salesSource.slice(salesSource.indexOf("async function saveContact"), salesSource.indexOf("const contactedCount"));
    expect(save).not.toContain("recentStructuredOffer");
  });
});
