import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const store = readFileSync("lib/store.ts", "utf8");
const mobileWorkspace = readFileSync("components/mobile-sales-workspace.tsx", "utf8");
const leadView = readFileSync("components/permit-leads-view.tsx", "utf8");

describe("lead to customer conversion flow", () => {
  it("keeps the original contact or visit action before attempting conversion", () => {
    expect(mobileWorkspace).toMatch(
      /api\/leads\/permits\/\$\{encodeURIComponent\(selected\.id\)\}\/action[\s\S]*if \(!response\.ok\)[\s\S]*if \(contactResult === "거래 시작"\)/
    );
    expect(leadView).toMatch(
      /const saved = await onAction\([\s\S]*if \(!saved\.ok\)[\s\S]*if \(result === "거래 시작"\) await convertLeadToCustomer\(\)/
    );
    expect(mobileWorkspace).toContain("거래처 연결 다시 시도");
    expect(leadView).toContain("거래처 연결 다시 시도");
  });

  it("repairs a missing conversion action without duplicating a completed one", () => {
    expect(store).toMatch(/async function ensurePermitLeadConversionAction[\s\S]*select=id,metadata[\s\S]*action_type=eq\.convert&limit=1/);
    expect(store).toContain("if (existing[0]?.id) {");
    expect(store).toContain('event_type: "lead_customer_conversion"');
    expect(store).toContain('throw new Error("거래처 전환 이력 저장을 확인하지 못했습니다.")');
    expect(store.match(/await ensurePermitLeadConversionAction\(/g)).toHaveLength(2);
  });

  it("does not hide a split between the linked customer and recorded conversion customer", () => {
    expect(store).toContain('const recordedCustomerId = String(existing[0].metadata?.customer_id || "")');
    expect(store).toContain("recordedCustomerId && recordedCustomerId !== customerId");
    expect(store).toContain("리드 연결 거래처와 기존 전환 이력의 거래처가 일치하지 않습니다.");
  });

  it("scopes duplicate matching, lead linking, and conversion history to one company", () => {
    expect(store).toMatch(/normalized_customers\?select=[^`]+&company_id=eq\.\$\{encodeURIComponent\(companyId\)\}/);
    expect(store).toMatch(/business_permit_leads\?id=eq\.\$\{encodeURIComponent\(leadId\)\}&company_id=eq\.\$\{encodeURIComponent\(companyId\)\}/);
    expect(store).toMatch(/lead_actions\?select=id,metadata&company_id=eq\.\$\{encodeURIComponent\(companyId\)\}&lead_id=eq\.\$\{encodeURIComponent\(leadId\)\}/);
    expect(store).toContain("company_id: companyId");
  });
});
