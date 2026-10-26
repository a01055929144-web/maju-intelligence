import { describe, expect, it } from "vitest";
import { buildBusinessInsights, resolveInsightsDateRange } from "../application/analytics/business-insights";
import type { PermitLeadItem, SalesContactLedgerItem, SalesQuoteListItem } from "../lib/store";

describe("resolveInsightsDateRange", () => {
  it("uses KST calendar month and the previous calendar month", () => {
    const range = resolveInsightsDateRange("month", new Date("2026-10-26T12:00:00+09:00"));
    expect(range.current.from.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(range.current.to.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(range.previous.from.toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });
});

describe("buildBusinessInsights", () => {
  it("compares funnel, delivery sharing and risks without cost data", () => {
    const range = resolveInsightsDateRange("month", new Date("2026-10-26T12:00:00+09:00"));
    const leads = [
      { createdAt: "2026-10-10T00:00:00Z", id: "l1" },
      { createdAt: "2026-09-10T00:00:00Z", id: "l2" }
    ] as PermitLeadItem[];
    const ledger = [
      { createdAt: "2026-10-11T00:00:00Z", leadId: "l1" },
      { createdAt: "2026-09-11T00:00:00Z", leadId: "l2" }
    ] as SalesContactLedgerItem[];
    const quotes = [
      { createdAt: "2026-10-12T00:00:00Z", id: "q1", status: "accepted", validUntil: "2026-11-01T00:00:00Z" },
      { createdAt: "2026-09-12T00:00:00Z", id: "q2", status: "sent", validUntil: "2026-09-30T00:00:00Z" }
    ] as SalesQuoteListItem[];
    const result = buildBusinessInsights({
      churnRisks: [{ customerId: "c1" }] as never,
      deliveries: [
        { completedAt: "2026-10-13T00:00:00Z", shared: true },
        { completedAt: "2026-10-14T00:00:00Z", shared: false }
      ],
      leads,
      ledger,
      quotes
    }, range, new Date("2026-10-26T12:00:00+09:00"));

    expect(result.current).toMatchObject({ contracts: 1, contacts: 1, deliveries: 2, leads: 1, quotes: 1, shareRate: 50 });
    expect(result.previous).toMatchObject({ contracts: 0, contacts: 1, deliveries: 0, leads: 1, quotes: 1, shareRate: 0 });
    expect(result.risks.churnCustomers).toHaveLength(1);
  });
});
