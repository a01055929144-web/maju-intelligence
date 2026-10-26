import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBusinessInsights, resolveInsightsDateRange } from "../application/analytics/business-insights";
import type { PermitLeadItem, SalesContactLedgerItem, SalesQuoteListItem } from "../lib/store";

const range = resolveInsightsDateRange("week", new Date("2026-10-26T12:00:00+09:00"));
const trendChartSource = readFileSync("components/insight-trend-chart.tsx", "utf8");
const insightsPageSource = readFileSync("app/insights/page.tsx", "utf8");

describe("N4-1 insights UI data", () => {
  it("shows an explicit empty state while keeping the mobile chart scrollable", () => {
    expect(trendChartSource).toContain('className="min-w-[640px] w-full"');
    expect(trendChartSource).toContain('className="mt-4 min-w-0 max-w-full"');
    expect(trendChartSource).toContain("선택한 이번·직전 기간에 기록이 없습니다.");
  });

  it("keeps current and previous conversion rates separate for the funnel comparison", () => {
    const insights = buildBusinessInsights({
      churnRisks: [],
      deliveries: [],
      leads: [
        { createdAt: "2026-10-26T01:00:00Z", id: "current-1" },
        { createdAt: "2026-10-26T02:00:00Z", id: "current-2" },
        { createdAt: "2026-10-26T03:00:00Z", id: "current-3" },
        { createdAt: "2026-10-26T04:00:00Z", id: "current-4" },
        { createdAt: "2026-10-19T01:00:00Z", id: "previous-1" },
        { createdAt: "2026-10-19T02:00:00Z", id: "previous-2" }
      ] as PermitLeadItem[],
      ledger: [
        { createdAt: "2026-10-26T05:00:00Z", leadId: "current-1" },
        { createdAt: "2026-10-26T06:00:00Z", leadId: "current-2" },
        { createdAt: "2026-10-19T05:00:00Z", leadId: "previous-1" }
      ] as SalesContactLedgerItem[],
      quotes: [
        { createdAt: "2026-10-26T07:00:00Z", id: "quote-current", status: "sent", validUntil: "2026-11-01" },
        { createdAt: "2026-10-19T07:00:00Z", id: "quote-previous", status: "sent", validUntil: "2026-10-25" }
      ] as SalesQuoteListItem[]
    }, range);

    expect(insights.funnel[0]).toMatchObject({ conversionRate: 50, previousConversionRate: 50 });
    expect(insights.funnel[1]).toMatchObject({ conversionRate: 50, previousConversionRate: 100 });
  });

  it("keeps SQL-dependent N4 sections visibly off without adding restricted reads", () => {
    expect(insightsPageSource).toContain("deliveryIssues: false");
    expect(insightsPageSource).toContain("INSIGHTS_DATA_FEATURES.deliveryIssues ? <RiskCard");
    expect(insightsPageSource).toContain("itemProfitability: false");
    expect(insightsPageSource).toContain("receivables: false");
    expect(insightsPageSource).toContain("shareLinks: false");
    expect(insightsPageSource).not.toMatch(/listProductCatalog|supplier_product_cost_history|getPartnerLedger|delivery_events\?/);
  });
});
