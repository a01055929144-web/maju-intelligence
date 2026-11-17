import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("business document partner prefill", () => {
  it("keeps company scope server-resolved and accepts only known partner types", () => {
    const page = read("app/operations/documents/page.tsx");
    expect(page).toContain("resolvePageCompanyId(customerSession, adminSession, params?.companyId)");
    expect(page).toContain('params?.partnerType === "customer" || params?.partnerType === "supplier"');
    expect(page).toContain("initialPartner={partnerType && partnerId ? { id: partnerId, type: partnerType } : undefined}");
  });

  it("uses the partner only as list and draft UI initial state", () => {
    const workspace = read("components/business-document-workspace.tsx");
    expect(workspace).toContain('partnerId: initialPartner?.id || ""');
    expect(workspace).toContain("initialPartner ? newDocument(initialPartner) : null");
    expect(workspace).toContain('aria-label="거래처 필터"');
  });
});
