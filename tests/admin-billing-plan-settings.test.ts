import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync("app/admin/billing/page.tsx", "utf8");
const workspaceSource = readFileSync("app/admin/billing/plan-settings-workspace.tsx", "utf8");

describe("WO-8 admin plan settings preparation", () => {
  it("is off by default behind a server-only feature flag", () => {
    expect(pageSource).toContain('process.env.WO8_BILLING_V2_ENABLED === "true"');
    expect(workspaceSource).toContain("disabled={!enabled}");
    expect(workspaceSource).toContain("기능 OFF");
  });

  it("does not access unapplied billing tables or payment APIs", () => {
    expect(workspaceSource).not.toContain("fetch(");
    expect(workspaceSource).not.toContain("supabase");
    expect(workspaceSource).not.toContain("/api/");
    expect(workspaceSource).not.toContain("TOSS_SECRET_KEY");
  });

  it("collects every representative-approved commercial setting without defaults", () => {
    for (const label of ["추천 산정 기간", "요금제 이름", "월 금액 (원)", "월 신규 리드 상한", "직원 상한", "체험 기간 (일)"]) {
      expect(workspaceSource).toContain(label);
    }
    expect(workspaceSource).toContain('monthlyAmountWon: ""');
    expect(workspaceSource).toContain('monthlyLeadLimit: ""');
    expect(workspaceSource).toContain('trialDays: ""');
  });
});
