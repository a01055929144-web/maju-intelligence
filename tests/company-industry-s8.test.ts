import { describe, expect, it } from "vitest";
import { COMPANY_INDUSTRY_OPTIONS, isPresetCompanyIndustry } from "../domains/organization/company-industry";
import { documentOutput, parseDocument, type DocumentVersion } from "../domains/pricing/document";
import { publicDocumentOutput } from "../domains/pricing/document-share";

const content = {
  kind: "sheet" as const,
  title: "합성 단가표",
  companyName: "합성 유통",
  industry: "농산",
  contact: "",
  recipient: "",
  footer: "",
  validUntil: "2099-12-31",
  theme: "blue" as const,
  layout: "table" as const,
  showPrice: true,
  showBrand: true,
  showSpec: true,
  lines: [{ productId: "10000000-0000-4000-8000-000000000001", displayName: "감자", brand: "", spec: "1kg", unit: "봉", price: 1000, taxType: "exempt" as const, visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" as const }],
};

describe("S-8 회사·단가표 업종", () => {
  it("uses the approved preset list while allowing a custom value", () => {
    expect(COMPANY_INDUSTRY_OPTIONS).toEqual(["농산", "축산", "수산", "종합식자재", "주류"]);
    expect(isPresetCompanyIndustry("주류")).toBe(true);
    expect(isPresetCompanyIndustry("수입식품")).toBe(false);
  });

  it("keeps the document industry in printed and public output", () => {
    const version: DocumentVersion = { id: "20000000-0000-4000-8000-000000000001", documentId: "30000000-0000-4000-8000-000000000001", version: 1, revision: 1, publishedAt: "2026-11-16T00:00:00.000Z", content: parseDocument(content), unavailablePromotions: [] };
    expect(documentOutput(version).industry).toBe("농산");
    expect(publicDocumentOutput(version).industry).toBe("농산");
  });
});
