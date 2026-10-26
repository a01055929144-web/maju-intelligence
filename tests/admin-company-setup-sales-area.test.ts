import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("app/admin/companies/[id]/setup/page.tsx", "utf8");
const workspaceSource = readFileSync("app/admin/companies/[id]/setup/workspace.tsx", "utf8");

describe("admin assisted setup sales-area gate", () => {
  it("makes sales area the first required setup step", () => {
    const stepsStart = pageSource.indexOf("const SETUP_STEPS");
    const salesArea = pageSource.indexOf('label: "영업 지역"', stepsStart);
    const companyInfo = pageSource.indexOf('label: "회사 정보"', stepsStart);

    expect(salesArea).toBeGreaterThan(stepsStart);
    expect(salesArea).toBeLessThan(companyInfo);
    expect(pageSource).toContain("index > 0 && !salesAreaConfigured");
    expect(pageSource).toContain("1단계 완료 후 진행");
  });

  it("requires a province and district selection instead of free text", () => {
    expect(workspaceSource).toContain("KOREAN_PROVINCES.map");
    expect(workspaceSource).toContain("KOREAN_ADMINISTRATIVE_AREAS[province]");
    expect(workspaceSource).toContain('if (!district) return setMessage("시·군·구를 선택해주세요.")');
    expect(workspaceSource).toContain("disabled={!salesAreaConfigured}");
  });

  it("reports the existing lead count returned by the existing scoped endpoint", () => {
    expect(workspaceSource).toContain('fetch("/api/leads/permits/keyword-search-regions"');
    expect(workspaceSource).toContain("payload?.existingLeadCount");
    expect(workspaceSource).toContain("router.refresh()");
  });
});
