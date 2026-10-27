import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSelectableSalesArea, resolveEffectiveSalesAreas } from "../lib/store";

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

  it("does not unlock setup for an unrecognized legacy district-only value", () => {
    expect(normalizeSelectableSalesArea("강남구")).toBe("");
    expect(resolveEffectiveSalesAreas(["강남구"], [])).toEqual([]);
  });

  it("keeps onboarding locked when only automatic fallback areas exist", () => {
    expect(resolveEffectiveSalesAreas([], [])).toEqual([]);
    expect(pageSource).toContain("관리자가 직접 선택합니다");
    expect(workspaceSource).toContain("자동 기본값과 별도로");
  });

  it("unlocks setup when one recognized explicit area exists", () => {
    expect(resolveEffectiveSalesAreas(["서울특별시"], [])).toEqual(["서울특별시"]);
    expect(resolveEffectiveSalesAreas(["경기도 성남시"], [])).toEqual(["경기도 성남시"]);
    expect(resolveEffectiveSalesAreas(["경기도 성남시 분당구"], [])).toEqual(["경기도 성남시 분당구"]);
    expect(resolveEffectiveSalesAreas(["서울특별시 강남구"], [])).toEqual(["서울특별시 강남구"]);
  });

  it("uses only recognized explicit or fallback areas for readiness", () => {
    expect(resolveEffectiveSalesAreas(["강남구", "서울특별시 강남구"], ["경기도 성남시"])).toEqual(["서울특별시 강남구"]);
    expect(resolveEffectiveSalesAreas(["강남구"], ["경기도 성남시 분당구"])).toEqual(["경기도 성남시 분당구"]);
  });
});
