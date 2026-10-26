import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Clock3, Truck } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { InsightTrendChart } from "@/components/insight-trend-chart";
import { buildBusinessInsights, insightsRoleRedirect, resolveInsightsDateRange, type InsightsPeriod } from "@/application/analytics/business-insights";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getChurnRiskCustomers, getCompanySettings, listInsightsDeliveryRecords, listPermitLeads, listSalesContactLedger, listSalesQuotes } from "@/lib/store";

const PERIODS: Array<{ label: string; value: InsightsPeriod }> = [
  { label: "일", value: "day" },
  { label: "주", value: "week" },
  { label: "월", value: "month" },
  { label: "분기", value: "quarter" }
];

// SQL/운영 적용이 확인되기 전에는 화면 구조만 노출하고 데이터 조회는 시작하지 않습니다.
const INSIGHTS_DATA_FEATURES = {
  deliveryIssues: false,
  itemProfitability: false,
  receivables: false,
  shareLinks: false
} as const;

export default async function InsightsPage({ searchParams }: { searchParams?: Promise<{ companyId?: string; period?: string }> }) {
  const params = await searchParams;
  const [customerSession, adminSession] = await Promise.all([getCustomerSession(), getAdminSession()]);
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession) {
    const roleRedirect = insightsRoleRedirect(customerSession.workspaceRole);
    if (roleRedirect) redirect(roleRedirect);
  }
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");
  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId);
  if (!companyId) redirect("/admin/companies");

  const period = PERIODS.some((item) => item.value === params?.period) ? params?.period as InsightsPeriod : "month";
  const range = resolveInsightsDateRange(period);
  const [company, leadResult, ledger, quotes, deliveries, churnRisks] = await Promise.all([
    getCompanySettings(companyId, customerSession?.companyName || "선택 고객사"),
    listPermitLeads(companyId, { excludeExcluded: false, includeExistingCustomers: true, includeOutsideSalesArea: true, includeTemporaryOperations: true, limit: 5000 }),
    listSalesContactLedger(companyId, 5000),
    listSalesQuotes(companyId, 500),
    listInsightsDeliveryRecords(companyId, { from: range.previous.from.toISOString(), to: range.current.to.toISOString() }),
    getChurnRiskCustomers(companyId).catch(() => [])
  ]);
  const insights = buildBusinessInsights({ churnRisks, deliveries, leads: leadResult.leads, ledger, quotes }, range);
  const churnRevenue = insights.risks.churnCustomers.reduce((total, customer) => total + customer.monthlyRevenue, 0);
  const preview = Boolean(adminSession && !customerSession);
  const scoped = (periodValue: InsightsPeriod) => {
    const query = new URLSearchParams({ period: periodValue });
    if (preview) query.set("companyId", companyId);
    return `/insights?${query.toString()}`;
  };

  return (
    <CustomerAppShell
      active="sales-performance"
      companyName={customerSession?.companyName || company.name}
      mode={preview ? "admin-preview" : "customer"}
      previewCompanyId={preview ? companyId : undefined}
      subtitle="영업과 배송 기록을 직전 기간과 비교해 막힌 지점을 찾습니다."
      title="성과 대시보드"
      userName={customerSession?.name || adminSession?.email || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <main className="mx-auto w-full max-w-[1480px] space-y-4 px-3 py-4 sm:px-5">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-teal-700" /><h1 className="text-xl font-black text-slate-950">성과 대시보드</h1></div>
            <p className="mt-1 text-sm font-semibold text-slate-500">{range.current.label} · 직전 {range.previous.label}과 비교</p>
          </div>
          <nav aria-label="성과 조회 기간" className="grid w-full grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:ml-auto sm:w-auto">
            {PERIODS.map((item) => <Link className={`px-4 py-2 text-center text-sm font-black ${period === item.value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-white"}`} href={scoped(item.value)} key={item.value}>{item.label}</Link>)}
          </nav>
          <button aria-disabled={!INSIGHTS_DATA_FEATURES.shareLinks} className="h-10 cursor-not-allowed rounded-lg bg-slate-200 px-4 text-sm font-black text-slate-500" disabled={!INSIGHTS_DATA_FEATURES.shareLinks} title="보기 전용 링크 저장 구조 승인 후 제공" type="button">공유 준비 중</button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard change={change(insights.current.leads, insights.previous.leads)} label="새 리드" value={`${insights.current.leads.toLocaleString()}곳`} />
          <MetricCard change={change(insights.current.contacts, insights.previous.contacts)} label="연락 매장" value={`${insights.current.contacts.toLocaleString()}곳`} />
          <MetricCard change={change(insights.current.quotes, insights.previous.quotes)} label="견적 전달" value={`${insights.current.quotes.toLocaleString()}건`} />
          <MetricCard change={change(insights.current.contracts, insights.previous.contracts)} label="신규 계약" value={`${insights.current.contracts.toLocaleString()}곳`} />
          <MetricCard change={change(insights.current.deliveries, insights.previous.deliveries)} label="배송 완료" value={`${insights.current.deliveries.toLocaleString()}건`} />
          <MetricCard change={insights.current.shareRate - insights.previous.shareRate} label="배송 공유율" suffix="%p" value={`${insights.current.shareRate}%`} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">기간별 영업 추이</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">기록이 있는 리드·연락·견적·계약을 같은 구간으로 나눠 직전 기간과 비교합니다.</p>
            <InsightTrendChart trend={insights.trend} />
          </article>

          <article className="min-w-0 flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-black text-slate-950">영업 단계 · 나아지는지</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">진한 막대는 이번 기간, 연한 막대는 직전 기간입니다.</p>
            <div className="mt-5 space-y-4">
              {insights.funnel.map((stage, index) => {
                const maximum = Math.max(1, ...insights.funnel.flatMap((item) => [item.value, item.previousValue]));
                const next = insights.funnel[index + 1];
                return <div className="grid grid-cols-[72px_minmax(0,1fr)_40px_58px] items-center gap-2" key={stage.key}>
                  <span className="truncate text-xs font-bold text-slate-600">{stage.label}</span>
                  <span aria-label={`${stage.label} 이번 ${stage.value}, 직전 ${stage.previousValue}`} className="relative h-5 overflow-hidden rounded bg-slate-100">
                    <span className="absolute inset-y-0 left-0 rounded bg-teal-100" style={{ width: `${stage.previousValue ? Math.max(2, stage.previousValue / maximum * 100) : 0}%` }} />
                    <span className="absolute inset-y-1 left-0 rounded bg-teal-700" style={{ width: `${stage.value ? Math.max(2, stage.value / maximum * 100) : 0}%` }} />
                  </span>
                  <strong className="text-right text-sm text-slate-950">{stage.value}</strong>
                  <span className={`text-right text-xs font-black ${stage.key === insights.blocked?.key ? "text-rose-700" : "text-teal-700"}`}>{next ? `${stage.conversionRate ?? 0}% →` : ""}</span>
                </div>;
              })}
            </div>
            {insights.blocked ? <p className="mt-5 rounded-xl bg-rose-100 px-3 py-2 text-sm font-bold leading-6 text-rose-900"><AlertTriangle className="mr-1 inline h-4 w-4" />막힌 곳 · {insights.blocked.label} 다음 전환 {insights.blocked.conversionRate ?? 0}% <span className="font-semibold text-rose-700">(직전 {insights.blocked.previousConversionRate ?? 0}%)</span></p> : null}
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-slate-950">놓치면 큰일 나는 것</h2><span className="text-xs font-semibold text-slate-500">현재 저장된 기록으로 확인 가능한 위험만 표시합니다.</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <RiskCard available={INSIGHTS_DATA_FEATURES.deliveryIssues} description="배송 이슈 기록의 운영 적용 확인 후 표시합니다." icon={AlertTriangle} label="반품·파손·CS" value="—" warning={false} />
            <RiskCard description={insights.risks.churnCustomers.length ? `기존 이탈 판정 · 월 매출 ${formatWon(churnRevenue)} 영향` : "기존 거래 이탈 판정 기준을 넘은 거래처가 없습니다."} icon={Clock3} label="거래처 이탈 위험" value={`${insights.risks.churnCustomers.length.toLocaleString()}곳`} warning={insights.risks.churnCustomers.length > 0} />
            <RiskCard available={INSIGHTS_DATA_FEATURES.itemProfitability} description="승인된 품목·주문 구조 적용 후 표시합니다." icon={Clock3} label="품목 이탈" value="—" warning={false} />
            <RiskCard available={INSIGHTS_DATA_FEATURES.receivables} description="미수 원장의 운영 적용 확인 후 표시합니다." icon={AlertTriangle} label="미수금" value="—" warning={false} />
            <RiskCard description="고객에게 보낸 견적 중 7일 안에 유효기간이 끝나는 건입니다. 계약 단가 만료는 추후 연결합니다." icon={AlertTriangle} label="견적 만료 임박" value={`${insights.risks.expiringQuotes.toLocaleString()}건`} warning={insights.risks.expiringQuotes > 0} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-black text-slate-950">거래처 이탈 위험 · 주문이 끊김</h2><div className="flex overflow-hidden rounded-lg border border-slate-200 text-xs font-bold sm:ml-auto"><button className="cursor-not-allowed bg-white px-3 py-2 text-slate-400" disabled type="button">품목 이탈</button><button className="bg-slate-800 px-3 py-2 text-white" type="button">거래처 이탈</button><button className="cursor-not-allowed bg-white px-3 py-2 text-slate-400" disabled type="button">안 시키는 품목</button></div></div>
            <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">기존 거래 이탈 계산 결과만 표시합니다.</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">상위 {Math.min(10, insights.risks.churnCustomers.length)}곳</span></div>
            {insights.risks.churnCustomers.length ? <div className="mt-3 overflow-x-auto"><table className="min-w-[680px] w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="p-2">거래처</th><th className="p-2">지역</th><th className="p-2 text-right">마지막 주문</th><th className="p-2 text-right">경과</th><th className="p-2 text-right">월 매출</th></tr></thead><tbody>{insights.risks.churnCustomers.slice(0, 10).map((customer) => <tr className="border-b border-slate-100 last:border-0" key={customer.customerId}><td className="p-2 font-bold text-slate-900">{customer.customerName}</td><td className="p-2 text-slate-600">{customer.region || "미지정"}</td><td className="p-2 text-right text-slate-600">{customer.lastOrderDate.slice(0, 10)}</td><td className="p-2 text-right font-bold text-rose-700">{customer.daysSinceLastOrder}일</td><td className="p-2 text-right text-slate-700">{customer.monthlyRevenue.toLocaleString()}원</td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-xl bg-teal-50 px-4 py-8 text-center text-sm font-bold text-teal-800"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />현재 이탈 위험 거래처가 없습니다.</p>}
          </article>

          <article className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 shadow-sm" data-feature-state={INSIGHTS_DATA_FEATURES.itemProfitability ? "on" : "off"}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-black text-slate-700">품목별 매출 · 마진율</h2><FeatureOffBadge /></div>
            <div className="mt-5 space-y-3" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <div className="grid grid-cols-[88px_minmax(0,1fr)_52px] items-center gap-3" key={index}><span className="h-3 rounded bg-slate-200" /><span className="h-3 rounded bg-slate-200" /><span className="h-3 rounded bg-slate-200" /></div>)}</div>
            <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-600">03의 품목·가격·주문 표와 SQL이 승인되고 운영 적용이 확인되면 활성화합니다. 현재 화면은 매입가·마진 값을 조회하지 않습니다.</p>
          </article>
        </section>

        <footer className="flex flex-wrap items-center gap-2 px-1 text-xs font-semibold text-slate-500"><span>데이터 출처</span><span className="rounded-full bg-teal-50 px-2 py-1 text-teal-800">MAJU 영업 기록</span><span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800"><Truck className="mr-1 inline h-3 w-3" />배송 완료·알림 기록</span><span className="ml-auto">CS 카드는 배송 이슈 기능 연결 후 제공</span></footer>
      </main>
    </CustomerAppShell>
  );
}

function change(current: number, previous: number) { return previous ? Math.round((current - previous) / previous * 100) : current ? 100 : 0; }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function formatWon(value: number) { return `${Math.round(value).toLocaleString()}원`; }

function MetricCard({ change, label, suffix = "%", value }: { change: number; label: string; suffix?: string; value: string }) {
  const positive = change >= 0;
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className={`mt-2 flex items-center text-xs font-black ${positive ? "text-teal-700" : "text-rose-700"}`}>{positive ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : <ArrowDownRight className="mr-1 h-3.5 w-3.5" />}{signed(change)}{suffix} · 직전 대비</p></article>;
}

function FeatureOffBadge() { return <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">기능 OFF</span>; }

function RiskCard({ available = true, description, icon: Icon, label, value, warning }: { available?: boolean; description: string; icon: typeof AlertTriangle; label: string; value: string; warning: boolean }) {
  return <article className={`rounded-xl border p-4 ${warning ? "border-rose-200 bg-rose-50" : available ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-300 bg-slate-50"}`} data-feature-state={available ? "on" : "off"}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-600">{label}</p>{!available ? <FeatureOffBadge /> : null}</div><p className={`mt-1 text-2xl font-black ${warning ? "text-rose-800" : "text-slate-950"}`}>{value}</p></div><Icon className={`h-6 w-6 ${warning ? "text-rose-600" : "text-slate-400"}`} /></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{description}</p></article>;
}
