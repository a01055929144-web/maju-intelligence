import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canShowLeadWorkspaceSettings } from "../lib/feature-modules";

describe("CC-21 lead settings visibility", () => {
  it("shows for V2 companies or distributor-sales companies, hides otherwise", () => {
    expect(canShowLeadWorkspaceSettings("c1", false, "c1,c2")).toBe(true);
    expect(canShowLeadWorkspaceSettings("c3", true, "c1,c2")).toBe(true);
    expect(canShowLeadWorkspaceSettings("c3", false, "c1,c2")).toBe(false);
    expect(canShowLeadWorkspaceSettings(null, false, "c1")).toBe(false);
    expect(canShowLeadWorkspaceSettings(undefined, true, "")).toBe(true);
  });
});

describe("CC-21 pages use the shared condition", () => {
  const sales = readFileSync("app/dashboard/settings/sales/page.tsx", "utf8");
  const setup = readFileSync("app/admin/companies/[id]/setup/page.tsx", "utf8");
  it("settings > 영업 정보 shows LeadWorkspaceSettings for distributor companies and opens the import tab when V2 is off", () => {
    expect(sales).toContain('canShowLeadWorkspaceSettings(session.companyId, isFeatureEnabled("DISTRIBUTOR_SALES", session.companyId))');
    expect(sales).toContain('initialTab={isLeadWorkspaceV2Enabled(session.companyId) ? "fields" : "import"}');
    expect(sales).toContain('customerHasCapability(session, "manage_customers")');
  });
  it("admin setup lead-import skips the sales-area condition only for distributor companies", () => {
    expect(setup).toContain("!salesAreaConfigured && !distributorSales");
    expect(setup).toContain('isFeatureEnabled("DISTRIBUTOR_SALES", company.id)');
    expect(setup).toContain("canShowLeadWorkspaceSettings(company.id, distributorSales)");
    // 일반 회사는 그대로 영업 지역을 먼저 저장해야 한다.
    expect(setup).toContain("영업 지역을 저장하면 엑셀 가져오기 대행을 진행할 수 있습니다.");
  });
});
