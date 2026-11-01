import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCustomerAssignmentKeys,
  resolvePageCompanyId,
  type AdminSession,
  type CustomerSession
} from "../lib/auth";
import { resolveCompanyStaffDisplayName } from "../domains/organization/staff-display-name";

describe("ARC-02 organization access contracts", () => {
  it("keeps a customer request on the company from its signed session", () => {
    const customerSession = makeCustomerSession({ companyId: "company-a" });
    const adminSession = makeAdminSession();

    expect(resolvePageCompanyId(customerSession, adminSession, "company-b")).toBe("company-a");
    expect(resolvePageCompanyId(null, adminSession, "company-b")).toBe("company-b");
    expect(resolvePageCompanyId(null, adminSession)).toBeUndefined();
  });

  it("uses a company membership id and company display name for staff identity", () => {
    const session = makeCustomerSession({
      companyMemberId: "member-a-123",
      invitedEmployeeName: " 회사 지정 이름 ",
      name: "소셜 닉네임",
      userId: "user-global-1",
      workspaceRole: "driver"
    });

    expect(resolveCompanyStaffDisplayName({
      appUserName: session.name,
      invitationEmployeeName: session.invitedEmployeeName
    })).toBe("회사 지정 이름");
    expect(getCustomerAssignmentKeys(session)).toMatchObject({
      staffMemberId: "member-a-123",
      legacyManagerKeys: expect.arrayContaining(["user-global-1", "회사 지정 이름"])
    });
  });

  it("revalidates staff membership with company and user together", () => {
    const storeSource = source("lib/store.ts");
    const membershipSource = between(
      storeSource,
      "export async function getActiveCustomerMembership",
      "function isCompanyClosedStatus"
    );

    expect(membershipSource).toContain("company_members?select=id,role");
    expect(membershipSource).toContain("company_id=eq.${encodeURIComponent(input.companyId)}");
    expect(membershipSource).toMatch(
      /user_id=eq\.\$\{encodeURIComponent\(\s*input\.userId\s*\)\}/
    );
    expect(membershipSource).toContain("companyMemberId: member.id");
    expect(membershipSource).toContain("resolveCompanyStaffDisplayName");
  });

  it("keeps the current public link path token-scoped and separate from staff permissions", () => {
    const routeSource = source("app/api/public/quotes/[token]/route.ts");
    const storeSource = source("lib/store.ts");
    const publicQuoteSource = between(storeSource, "export async function getPublicSalesQuote", "export type CustomerContractPrice");

    expect(routeSource).not.toContain("getRequestAuthScope");
    expect(routeSource).not.toContain("getCustomerSession");
    expect(routeSource).not.toContain("getAdminSession");
    expect(routeSource).not.toContain("getCustomerAssignmentKeys");
    expect(routeSource).not.toContain("scopeHasCapability");
    expect(routeSource).not.toContain("workspaceRole");
    expect(routeSource).not.toContain("companyMemberId");
    expect(routeSource).toContain('"Cache-Control": "private, no-store"');

    expect(publicQuoteSource).toContain("public_token=eq.${encodeURIComponent(publicToken)}");
    expect(publicQuoteSource).toContain("public_enabled=eq.true");
    expect(publicQuoteSource).toContain("valid_until=gt.${encodeURIComponent(new Date().toISOString())}");
    expect(publicQuoteSource).toContain("company_id=eq.${encodeURIComponent(quote.company_id)}");
    expect(publicQuoteSource).toContain("quote_id=eq.${encodeURIComponent(quote.id)}");
    expect(publicQuoteSource).not.toMatch(/purchase_price|cost_price|margin_rate|supplier_id/);
  });
});

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function between(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing source marker: ${end}`).toBeGreaterThan(startIndex);
  return value.slice(startIndex, endIndex);
}

function makeCustomerSession(overrides: Partial<CustomerSession> = {}): CustomerSession {
  return {
    appRole: "customer_user",
    companyId: "company-a",
    companyName: "테스트 회사",
    email: "staff@example.com",
    name: "테스트 직원",
    role: "member",
    workspaceRole: "member",
    workspaceType: "company",
    ...overrides
  };
}

function makeAdminSession(): AdminSession {
  return {
    appRole: "maju_super_admin",
    email: "admin@example.com",
    name: "MAJU 관리자",
    role: "super_admin"
  };
}
