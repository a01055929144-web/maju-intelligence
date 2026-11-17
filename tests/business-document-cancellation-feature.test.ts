import { afterEach, describe, expect, it } from "vitest";
import { businessDocumentCancellationEnabled } from "@/lib/business-document-cancellation-feature";

const companyId = "00000000-0000-4000-8000-000000000001";

describe("business document cancellation feature", () => {
  afterEach(() => {
    delete process.env.BUSINESS_DOCUMENT_CANCELLATION_ENABLED;
    delete process.env.BUSINESS_DOCUMENT_CANCELLATION_COMPANY_IDS;
  });

  it("is off by default", () => {
    expect(businessDocumentCancellationEnabled(companyId)).toBe(false);
  });

  it("requires both the switch and company allowlist", () => {
    process.env.BUSINESS_DOCUMENT_CANCELLATION_ENABLED = "true";
    expect(businessDocumentCancellationEnabled(companyId)).toBe(false);
    process.env.BUSINESS_DOCUMENT_CANCELLATION_COMPANY_IDS = companyId;
    expect(businessDocumentCancellationEnabled(companyId)).toBe(true);
    expect(businessDocumentCancellationEnabled("00000000-0000-4000-8000-000000000002")).toBe(false);
  });
});
