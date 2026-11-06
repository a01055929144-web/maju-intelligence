import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { leadDocumentEntryAccess, leadDocumentEntryHref } from "../domains/lead/document-entry";

const leadId = "20000000-0000-4000-8000-000000000001";

describe("lead document entry links", () => {
  it.each([
    ["owner", true, true],
    ["manager", true, true],
    ["sales", true, false],
    ["member", false, false],
  ])("limits %s document entry to its role", (workspaceRole, canCreateQuote, canCreateSheet) => {
    expect(leadDocumentEntryAccess({ admin: false, pricingEnabled: true, workspaceRole })).toEqual({ canCreateQuote, canCreateSheet });
  });

  it("allows admin preview and hides every entry while pricing is off", () => {
    expect(leadDocumentEntryAccess({ admin: true, pricingEnabled: true })).toEqual({ canCreateQuote: true, canCreateSheet: true });
    expect(leadDocumentEntryAccess({ admin: true, pricingEnabled: false })).toEqual({ canCreateQuote: false, canCreateSheet: false });
  });

  it("passes only kind, lead and the optional admin company scope", () => {
    expect(leadDocumentEntryHref("quote", leadId)).toBe(`/revenue/pricing/documents?start=quote&leadId=${leadId}`);
    expect(leadDocumentEntryHref("sheet", leadId, "company a")).toBe(`/revenue/pricing/documents?start=sheet&leadId=${leadId}&companyId=company+a`);
  });

  it("keeps server rendering free of direct window access and never records a send", () => {
    const source = readFileSync("components/permit-leads-view.tsx", "utf8");
    const start = source.indexOf("정식 영업 문서");
    const end = source.indexOf("현장 임시 견적", start);
    const entry = source.slice(start, end);
    expect(entry).not.toContain("window.location");
    expect(entry).toContain("withPermitLeadCompanyQuery(leadDocumentEntryHref");
    expect(entry).not.toContain("record-send");
    expect(entry).not.toContain("발송 완료");
  });
});
