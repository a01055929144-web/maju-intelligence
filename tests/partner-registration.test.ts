import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canIssuePartnerTaxInvoice, normalizePartnerRegistration } from "../domains/partner/registration";

const pending = { partnerType: "customer" as const, displayName: " 합성 식당 ", representativeName: " 대표 ", phone: "010-0000-0000", address: "서울 합성로 1", businessStatus: "registration_pending" as const };

describe("CX-126 거래처 공통 등록", () => {
  it("개업 준비는 사업자번호 없이 매출처와 매입처가 같은 규칙을 쓴다", () => {
    expect(normalizePartnerRegistration(pending)).toMatchObject({ displayName: "합성 식당", representativeName: "대표", businessNumber: "" });
    expect(normalizePartnerRegistration({ ...pending, partnerType: "supplier" })).toMatchObject({ partnerType: "supplier", businessStatus: "registration_pending" });
  });
  it("사업자 확인 상태는 번호·형태·계산서 이메일이 모두 필요하다", () => {
    expect(() => normalizePartnerRegistration({ ...pending, businessStatus: "active" })).toThrow(/사업자번호/);
    expect(normalizePartnerRegistration({ ...pending, businessStatus: "active", businessNumber: "123-45-67890", businessEntityType: "individual", taxInvoiceEmail: "tax@example.test" }).businessNumber).toBe("1234567890");
  });
  it("세금계산서는 사업자 확인 뒤에만 허용한다", () => {
    expect(canIssuePartnerTaxInvoice("registration_pending")).toBe(false);
    expect(canIssuePartnerTaxInvoice("active")).toBe(true);
  });
  it("API는 회사 기능과 매출처·매입처 권한을 각각 확인한다", () => {
    const source = readFileSync("app/api/business-partners/route.ts", "utf8");
    expect(source).toContain('isFeatureEnabled("PARTNER_REGISTRATION", scope.companyId)');
    expect(source).toContain('scopeHasCapability(scope, "manage_sales")');
    expect(source).toContain('scopeHasCapability(scope, "manage_customers")');
  });
});
