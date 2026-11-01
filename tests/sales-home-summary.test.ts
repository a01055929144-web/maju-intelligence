import { describe, expect, it } from "vitest";
import { buildSalesHomeSummary } from "../application/analytics/sales-home-summary";
import type { PermitLeadItem, SalesContactLedgerItem } from "../lib/store";

const baseLead = {
  businessName: "매장", createdAt: "2026-10-25T00:00:00Z", grade: null, id: "lead", industryPrimary: "한식",
  industryTags: [], isActive: true, isDuplicate: false, isTargetIndustry: true, isTemporaryOperation: false,
  isTemporaryOperationSuspected: false, leadPeriod: "today", nextActionReasons: [], scoreBreakdown: {}, scoreTotal: 70,
  status: "신규 수집", updatedAt: "2026-10-25T00:00:00Z"
} satisfies PermitLeadItem;

describe("sales home summary", () => {
  it("uses lead actions for monthly channel and contact totals", () => {
    const ledger = [{
      actionType: "sms", address: "서울", businessName: "매장", collateralTypes: [], createdAt: "2026-10-25T01:00:00Z",
      id: "action", leadId: "lead", leadStatus: "문자 발송", phone: "010-1111-2222"
    }] satisfies SalesContactLedgerItem[];
    const summary = buildSalesHomeSummary([{ ...baseLead, phone: "010-1111-2222" }], ledger, new Date("2026-10-25T10:00:00+09:00"));
    expect(summary.channelCounts.find((item) => item.key === "sms")?.value).toBe(1);
    expect(summary.totals.contactedThisMonth).toBe(1);
    expect(summary.tasks.smsReady).toBe(0);
  });

  it("builds the seven-day lead overview and three-item previews", () => {
    const leads = [
      { ...baseLead, businessName: "오늘 매장", createdAt: "2026-10-25T00:00:00Z", id: "today", scoreTotal: 75 },
      { ...baseLead, businessName: "관심 매장", createdAt: "2026-10-10T00:00:00Z", id: "hot", scoreTotal: 95 },
      { ...baseLead, businessName: "보통 매장", createdAt: "2026-10-09T00:00:00Z", id: "warm", scoreTotal: 60 },
      { ...baseLead, businessName: "낮은 매장", createdAt: "2026-10-08T00:00:00Z", id: "cold", scoreTotal: 20 }
    ] satisfies PermitLeadItem[];
    const summary = buildSalesHomeSummary(leads, [], new Date("2026-10-25T10:00:00+09:00"));

    expect(summary.leadOverview).toEqual({ newThisWeek: 1, sales: 3 });
    expect(summary.leadPreviews.newest.map((lead) => lead.id)).toEqual(["today"]);
    expect(summary.leadPreviews.highInterest.map((lead) => lead.id)).toEqual(["hot", "warm", "cold"]);
  });
});
