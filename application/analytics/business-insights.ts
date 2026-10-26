import type { ChurnRiskCustomer, PermitLeadItem, SalesContactLedgerItem, SalesQuoteListItem } from "../../lib/store";
import type { InsightsDeliveryRecord } from "../../lib/store/06-insights";

export type InsightsPeriod = "day" | "week" | "month" | "quarter";

export function insightsRoleRedirect(workspaceRole: string | null | undefined) {
  return workspaceRole === "owner" || workspaceRole === "manager" ? null : "/leads?type=permit";
}

export type InsightsDateRange = {
  current: { from: Date; label: string; to: Date };
  previous: { from: Date; label: string; to: Date };
};

const PERIOD_LABELS: Record<InsightsPeriod, string> = { day: "일", week: "주", month: "월", quarter: "분기" };

function kstDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function kstMidnight(year: number, month: number, day: number) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+09:00`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function formatRange(from: Date, to: Date) {
  const format = (value: Date) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(value);
  return `${format(from)}~${format(addDays(to, -1))}`;
}

export function resolveInsightsDateRange(period: InsightsPeriod, now = new Date()): InsightsDateRange {
  const { year, month, day } = kstDateParts(now);
  const today = kstMidnight(year, month, day);
  let from: Date;
  let to: Date;
  let previousFrom: Date;
  if (period === "day") {
    from = today;
    to = addDays(today, 1);
    previousFrom = addDays(from, -1);
  } else if (period === "week") {
    const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(today);
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekdayLabel) + 1;
    from = addDays(today, -(weekday - 1));
    to = addDays(from, 7);
    previousFrom = addDays(from, -7);
  } else if (period === "month") {
    from = kstMidnight(year, month, 1);
    to = month === 12 ? kstMidnight(year + 1, 1, 1) : kstMidnight(year, month + 1, 1);
    previousFrom = month === 1 ? kstMidnight(year - 1, 12, 1) : kstMidnight(year, month - 1, 1);
  } else {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    from = kstMidnight(year, quarterStartMonth, 1);
    to = quarterStartMonth === 10 ? kstMidnight(year + 1, 1, 1) : kstMidnight(year, quarterStartMonth + 3, 1);
    previousFrom = quarterStartMonth === 1 ? kstMidnight(year - 1, 10, 1) : kstMidnight(year, quarterStartMonth - 3, 1);
  }
  return {
    current: { from, label: `${PERIOD_LABELS[period]} · ${formatRange(from, to)}`, to },
    previous: { from: previousFrom, label: formatRange(previousFrom, from), to: from }
  };
}

type MetricInput = {
  churnRisks: ChurnRiskCustomer[];
  deliveries: InsightsDeliveryRecord[];
  leads: PermitLeadItem[];
  ledger: SalesContactLedgerItem[];
  quotes: SalesQuoteListItem[];
};

function inRange(value: string, range: { from: Date; to: Date }) {
  const timestamp = new Date(value).getTime();
  return timestamp >= range.from.getTime() && timestamp < range.to.getTime();
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

type TrendMetric = "leads" | "contacts" | "quotes" | "contracts";
type TrendCounts = Record<TrendMetric, number>;

function trendCounts(input: MetricInput, range: { from: Date; to: Date }, count: number): TrendCounts[] {
  const buckets = Array.from({ length: count }, () => ({ leads: 0, contacts: 0, quotes: 0, contracts: 0 }));
  const contacted = Array.from({ length: count }, () => new Set<string>());
  const duration = range.to.getTime() - range.from.getTime();
  const indexFor = (value: string) => {
    if (!inRange(value, range)) return -1;
    return Math.min(count - 1, Math.floor(((new Date(value).getTime() - range.from.getTime()) / duration) * count));
  };
  for (const lead of input.leads) {
    const index = indexFor(lead.createdAt);
    if (index >= 0) buckets[index].leads += 1;
  }
  for (const action of input.ledger) {
    const index = indexFor(action.createdAt);
    if (index >= 0) contacted[index].add(action.leadId);
  }
  for (const quote of input.quotes) {
    const index = indexFor(quote.createdAt);
    if (index < 0 || quote.status === "draft" || quote.status === "cancelled") continue;
    buckets[index].quotes += 1;
    if (quote.status === "accepted") buckets[index].contracts += 1;
  }
  for (let index = 0; index < count; index += 1) buckets[index].contacts = contacted[index].size;
  return buckets;
}

function buildTrend(input: MetricInput, dateRange: InsightsDateRange) {
  const days = (dateRange.current.to.getTime() - dateRange.current.from.getTime()) / 86_400_000;
  const count = days <= 1 ? 6 : days <= 7 ? 7 : 6;
  const current = trendCounts(input, dateRange.current, count);
  const previous = trendCounts(input, dateRange.previous, count);
  const duration = dateRange.current.to.getTime() - dateRange.current.from.getTime();
  const formatter = days <= 1
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric" })
    : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  return Array.from({ length: count }, (_, index) => {
    const midpoint = new Date(dateRange.current.from.getTime() + ((index + 0.5) / count) * duration);
    const label = formatter.format(midpoint);
    return { label, current: current[index], previous: previous[index] };
  });
}

export function buildBusinessInsights(input: MetricInput, dateRange: InsightsDateRange, now = new Date()) {
  const summarize = (range: { from: Date; to: Date }) => {
    const leads = input.leads.filter((lead) => inRange(lead.createdAt, range));
    const actions = input.ledger.filter((action) => inRange(action.createdAt, range));
    const contactedLeadIds = new Set(actions.map((action) => action.leadId));
    const quotes = input.quotes.filter((quote) => inRange(quote.createdAt, range) && quote.status !== "draft" && quote.status !== "cancelled");
    const contracts = quotes.filter((quote) => quote.status === "accepted");
    const deliveries = input.deliveries.filter((delivery) => inRange(delivery.completedAt, range));
    const shared = deliveries.filter((delivery) => delivery.shared).length;
    return {
      contracts: contracts.length,
      contacts: contactedLeadIds.size,
      deliveries: deliveries.length,
      leads: leads.length,
      quotes: quotes.length,
      shareRate: deliveries.length ? Math.round((shared / deliveries.length) * 100) : 0
    };
  };
  const current = summarize(dateRange.current);
  const previous = summarize(dateRange.previous);
  const stages = [
    { key: "leads", label: "새 리드" },
    { key: "contacts", label: "연락" },
    { key: "quotes", label: "견적 전달" },
    { key: "contracts", label: "계약" }
  ] as const;
  const funnel = stages.map((stage, index) => {
    const next = stages[index + 1];
    const value = current[stage.key];
    const previousValue = previous[stage.key];
    return {
      ...stage,
      change: percentChange(value, previousValue),
      conversionRate: next && value ? Math.round((current[next.key] / value) * 1000) / 10 : null,
      previousConversionRate: next && previousValue ? Math.round((previous[next.key] / previousValue) * 1000) / 10 : null,
      previousValue,
      value
    };
  });
  const blocked = funnel.filter((stage) => stage.conversionRate != null).sort((a, b) => (a.conversionRate || 0) - (b.conversionRate || 0))[0];
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000);
  const expiringQuotes = input.quotes.filter((quote) => quote.status === "sent" && new Date(quote.validUntil) >= now && new Date(quote.validUntil) <= sevenDaysFromNow).length;
  return {
    blocked,
    current,
    funnel,
    previous,
    trend: buildTrend(input, dateRange),
    risks: {
      churnCustomers: input.churnRisks,
      expiringQuotes
    }
  };
}
