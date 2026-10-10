import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, CircleDollarSign, ExternalLink, FileText, Percent, ReceiptText, Route, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { PipelineCandidatesTable } from "@/components/pipeline-candidates-table";
import { Progress } from "@/components/ui/progress";
import { SalesWorkspaceNav } from "@/components/sales-workspace-nav";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getRevenuePipeline, listSalesQuotes, type RevenuePipeline, type SalesQuoteListItem } from "@/lib/store";

const emptyPipeline: RevenuePipeline = {
  conversionRate: 0,
  expectedRevenue: 0,
  failed: 0,
  interested: 0,
  items: [],
  pending: 0,
  quoteRequests: 0,
  weightedRevenue: 0
};

type QuoteStatusFilter = "accepted" | "cancelled" | "draft" | "expired" | "rejected" | "sent";
type QuoteValidityFilter = "active" | "expired" | "expiring";

export default async function RevenuePipelinePage({ searchParams }: { searchParams?: Promise<{ companyId?: string; q?: string; quoteStatus?: string; quoteValidity?: string; section?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const requestedSection = resolvedSearchParams?.section;
  const section = requestedSection === "basis" || requestedSection === "status" || requestedSection === "candidates" || requestedSection === "quotes" ? requestedSection : "summary";
  const quoteQuery = resolvedSearchParams?.q?.trim() || "";
  const quoteStatus = isQuoteStatusFilter(resolvedSearchParams?.quoteStatus) ? resolvedSearchParams.quoteStatus : "";
  const quoteValidity = isQuoteValidityFilter(resolvedSearchParams?.quoteValidity) ? resolvedSearchParams.quoteValidity : "";
  const sectionHref = (nextSection: string) => {
    const params = new URLSearchParams({ section: nextSection });
    if (companyId) params.set("companyId", companyId);
    if (nextSection === "quotes") {
      if (quoteQuery) params.set("q", quoteQuery);
      if (quoteStatus) params.set("quoteStatus", quoteStatus);
      if (quoteValidity) params.set("quoteValidity", quoteValidity);
    }
    return `/revenue/pipeline?${params.toString()}`;
  };
  let pipeline = emptyPipeline;
  let savedQuotes: SalesQuoteListItem[] = [];
  let pipelineError = "";

  try {
    [pipeline, savedQuotes] = await Promise.all([
      getRevenuePipeline(companyId),
      companyId ? listSalesQuotes(companyId) : Promise.resolve([])
    ]);
  } catch (error) {
    pipelineError = error instanceof Error ? error.message : "매출 파이프라인을 불러오지 못했습니다.";
  }

  const isAdminPreview = Boolean(adminSession && !customerSession);
  const filteredQuotes = filterSalesQuotes(savedQuotes, {
    query: quoteQuery,
    status: quoteStatus,
    validity: quoteValidity
  });
  const pipelineActions = [
    {
      description: "보류·실패 사유를 확인하고 재연락 일정을 잡으세요.",
      href: sectionHref("candidates"),
      label: "미처리 우선",
      tone: "amber" as const,
      value: `${pipeline.pending + pipeline.failed}건`
    },
    {
      description: "단가와 조건을 확정해 견적을 마무리하세요.",
      href: sectionHref("candidates"),
      label: "견적 요청",
      tone: "teal" as const,
      value: `${pipeline.quoteRequests}건`
    },
    {
      description: "관심 품목을 제안하고 샘플 일정을 확인하세요.",
      href: sectionHref("candidates"),
      label: "관심 있음",
      tone: "emerald" as const,
      value: `${pipeline.interested}건`
    }
  ];

  return (
    <CustomerAppShell
      active="revenue"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="견적 요청과 후속 영업 기회를 관리합니다."
      title="영업 관리"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] px-4 py-4 sm:px-4">
        <SalesWorkspaceNav
          active={section}
          companyId={companyId}
          pipelineCount={pipeline.items.length}
          quoteCount={savedQuotes.length}
          showProducts={Boolean(adminSession || (customerSession && customerHasCapability(customerSession, "manage_sales")))}
        />

        <div className="min-w-0 space-y-4">
        <div className={`${section === "summary" ? "maju-section-card" : "hidden"} scroll-mt-28`} id="pipeline-summary">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">기회 현황</p>
              <p className="mt-1 maju-muted-label">방문 기록 · 견적 요청</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{pipeline.items.length.toLocaleString()}건 관리</Badge>
          </div>
          <div className="grid md:grid-cols-4">
            <Metric icon={Banknote} label="예상 총매출" value={`${pipeline.expectedRevenue.toLocaleString()}만원`} />
            <Metric icon={CircleDollarSign} label="가중 매출" value={`${pipeline.weightedRevenue.toLocaleString()}만원`} />
            <Metric icon={TrendingUp} label="견적 대기" value={`${pipeline.quoteRequests}건`} />
            <Metric icon={Percent} label="예상 전환율" value={`${pipeline.conversionRate}%`} />
          </div>
        </div>

        {pipelineError ? (
          <div aria-live="assertive" className="maju-filter-box flex flex-col gap-3 border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div>
              <p className="font-bold">기회 현황을 불러오지 못했습니다.</p>
              <p className="mt-1 font-medium text-amber-800">잠시 후 다시 시도해 주세요. 현재 화면의 수치는 임시로 0으로 표시됩니다.</p>
            </div>
            <Link className="maju-button-secondary min-h-11 shrink-0 justify-center bg-white sm:min-h-9" href={sectionHref(section)}>
              다시 불러오기
            </Link>
          </div>
        ) : null}

        <div className={section === "summary" ? "maju-section-card" : "hidden"}>
          <div className="maju-card-header">
            <p className="maju-section-title">다음 액션 요약</p>
            <p className="mt-1 maju-muted-label">미처리 건부터 바로 이어서 할 일</p>
          </div>
          <div className="grid lg:grid-cols-3">
            {pipelineActions.map((action) => (
              <PipelineActionCard key={action.label} {...action} />
            ))}
          </div>
        </div>

        <div className={section === "basis" ? "scroll-mt-28" : "hidden"} id="pipeline-basis">
          <PipelineBasisPanel
          companyId={isAdminPreview ? companyId || "" : ""}
          conversionRate={pipeline.conversionRate}
          expectedRevenue={pipeline.expectedRevenue}
          itemCount={pipeline.items.length}
          quoteRequests={pipeline.quoteRequests}
          weightedRevenue={pipeline.weightedRevenue}
          />
        </div>

        <div className="min-w-0">
          <section className={section === "status" ? "maju-section-card scroll-mt-28" : "hidden"} id="pipeline-status">
            <div className="maju-card-header">
              <h2 className="text-lg font-black text-slate-950">상태 분포</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">후속 작업 단계</p>
            </div>
            <div className="space-y-4 p-4">
              <PipelineLine label="견적 요청" value={pipeline.quoteRequests} total={pipeline.items.length} />
              <PipelineLine label="관심 있음" value={pipeline.interested} total={pipeline.items.length} />
              <PipelineLine label="보류" value={pipeline.pending} total={pipeline.items.length} />
              <PipelineLine label="실패" value={pipeline.failed} total={pipeline.items.length} />
            </div>
          </section>

          {section === "candidates" ? <PipelineCandidatesTable items={pipeline.items} weightedRevenue={pipeline.weightedRevenue} /> : null}
          {section === "quotes" ? (
            <SalesQuoteLedger
              companyId={companyId}
              filters={{ query: quoteQuery, status: quoteStatus, validity: quoteValidity }}
              quotes={filteredQuotes}
              totalCount={savedQuotes.length}
            />
          ) : null}
        </div>
        </div>
      </section>
    </CustomerAppShell>
  );
}

const quoteStatusPresentation: Record<SalesQuoteListItem["status"], { className: string; label: string }> = {
  accepted: { className: "bg-emerald-50 text-emerald-800", label: "수락" },
  cancelled: { className: "bg-slate-100 text-slate-600", label: "취소" },
  draft: { className: "bg-slate-100 text-slate-700", label: "초안" },
  expired: { className: "bg-amber-50 text-amber-800", label: "만료" },
  rejected: { className: "bg-rose-50 text-rose-700", label: "거절" },
  sent: { className: "bg-blue-50 text-blue-700", label: "발송" }
};

function SalesQuoteLedger({
  companyId,
  filters,
  quotes,
  totalCount
}: {
  companyId?: string;
  filters: { query: string; status: QuoteStatusFilter | ""; validity: QuoteValidityFilter | "" };
  quotes: SalesQuoteListItem[];
  totalCount: number;
}) {
  const activeCount = quotes.filter((quote) => quote.status === "sent" && quote.publicEnabled).length;
  const expiredCount = quotes.filter((quote) => quote.status === "expired").length;
  const totalSales = quotes.reduce((sum, quote) => sum + quote.totalSales, 0);
  const hasFilters = Boolean(filters.query || filters.status || filters.validity);
  const resetParams = new URLSearchParams({ section: "quotes" });
  if (companyId) resetParams.set("companyId", companyId);
  const mobileSalesHref = companyId ? `/mobile/sales?companyId=${encodeURIComponent(companyId)}` : "/mobile/sales";

  return (
    <section className="maju-section-card overflow-hidden" id="sales-quote-ledger">
      <div className="maju-card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="maju-section-title">발행 견적 원장</p>
          <p className="mt-1 text-sm text-slate-500">모바일 영업에서 저장한 견적의 금액·유효기간·고객 링크를 확인합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Badge className="bg-blue-50 text-blue-700">공유 중 {activeCount}건</Badge>
          <Badge className="bg-amber-50 text-amber-800">만료 {expiredCount}건</Badge>
          <Badge className="bg-teal-50 text-teal-800">총 {totalSales.toLocaleString()}원</Badge>
        </div>
      </div>
      <form className="grid gap-3 border-b border-slate-200/80 bg-slate-50/70 p-4 md:grid-cols-[minmax(240px,1fr)_180px_180px_auto] md:items-end" method="get">
        <input name="section" type="hidden" value="quotes" />
        {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
        <label className="min-w-0">
          <span className="maju-muted-label">견적 검색</span>
          <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              defaultValue={filters.query}
              name="q"
              placeholder="견적번호, 수신처, 담당자"
              type="search"
            />
          </span>
        </label>
        <label>
          <span className="maju-muted-label">상태</span>
          <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" defaultValue={filters.status} name="quoteStatus">
            <option value="">전체 상태</option>
            <option value="draft">초안</option>
            <option value="sent">발송</option>
            <option value="accepted">수락</option>
            <option value="rejected">거절</option>
            <option value="expired">만료</option>
            <option value="cancelled">취소</option>
          </select>
        </label>
        <label>
          <span className="maju-muted-label">유효기간</span>
          <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700" defaultValue={filters.validity} name="quoteValidity">
            <option value="">전체 기간</option>
            <option value="active">유효</option>
            <option value="expiring">7일 내 만료</option>
            <option value="expired">기간 지남</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className="maju-button-primary min-h-11 flex-1 justify-center md:flex-none" type="submit">조회</button>
          {hasFilters ? <Link className="maju-button-secondary min-h-11 flex-1 justify-center md:flex-none" href={`/revenue/pipeline?${resetParams.toString()}`}>초기화</Link> : null}
        </div>
      </form>
      {hasFilters ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-600">전체 {totalCount.toLocaleString()}건 중 <span className="text-teal-700">{quotes.length.toLocaleString()}건</span></p>
          <p className="text-xs font-medium text-slate-500">검색 조건은 주소에 저장되어 다시 열어도 유지됩니다.</p>
        </div>
      ) : null}
      {quotes.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">견적번호</th>
                <th className="px-4 py-3">수신처·제목</th>
                <th className="px-4 py-3">담당자</th>
                <th className="px-4 py-3 text-right">판매 합계</th>
                <th className="px-4 py-3">유효기간</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">고객용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotes.map((quote) => {
                const status = quoteStatusPresentation[quote.status];
                const publicAvailable = quote.publicEnabled && quote.status !== "expired" && quote.status !== "cancelled";
                return (
                  <tr className="align-middle hover:bg-slate-50/70" key={quote.id}>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-700">{quote.quoteNumber}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatKoreanDate(quote.createdAt)}</p>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-sm font-semibold text-slate-950">{quote.recipientName || "수신처 미입력"}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{quote.title}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-600">{quote.createdByName || "담당자 미기록"}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-950">{quote.totalSales.toLocaleString()}원</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-600">{formatKoreanDate(quote.validUntil)}</td>
                    <td className="px-4 py-3"><Badge className={status.className}>{status.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {publicAvailable ? (
                        <Link className="maju-button-secondary min-h-9 justify-center" href={`/quote/${quote.publicToken}`} target="_blank">
                          열기 <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : <span className="text-xs font-semibold text-slate-400">공유 종료</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold text-slate-950">{hasFilters ? "조건에 맞는 견적이 없습니다." : "아직 저장된 견적이 없습니다."}</p>
          <p className="mt-1 text-sm text-slate-500">{hasFilters ? "검색어나 필터를 바꿔 다시 조회해 주세요." : "모바일 영업에서 리드를 선택하고 품목·판매가·유효기간을 확정하면 여기에 누적됩니다."}</p>
          {hasFilters ? (
            <Link className="maju-button-secondary mt-5" href={`/revenue/pipeline?${resetParams.toString()}`}>필터 초기화</Link>
          ) : (
            <Link className="maju-button-primary mt-5" href={mobileSalesHref}>모바일 영업 열기 <ArrowRight className="h-4 w-4" /></Link>
          )}
        </div>
      )}
    </section>
  );
}

function isQuoteStatusFilter(value?: string): value is QuoteStatusFilter {
  return value === "accepted" || value === "cancelled" || value === "draft" || value === "expired" || value === "rejected" || value === "sent";
}

function isQuoteValidityFilter(value?: string): value is QuoteValidityFilter {
  return value === "active" || value === "expired" || value === "expiring";
}

function filterSalesQuotes(
  quotes: SalesQuoteListItem[],
  filters: { query: string; status: QuoteStatusFilter | ""; validity: QuoteValidityFilter | "" }
) {
  const normalizedQuery = filters.query.toLocaleLowerCase("ko-KR");
  const today = getSeoulDateKey(new Date());
  const expiringThrough = getSeoulDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  return quotes.filter((quote) => {
    const matchesQuery = !normalizedQuery || [quote.quoteNumber, quote.recipientName, quote.createdByName]
      .some((value) => value?.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    const matchesStatus = !filters.status || quote.status === filters.status;
    const validUntil = quote.validUntil.slice(0, 10);
    const matchesValidity = !filters.validity
      || (filters.validity === "active" && validUntil >= today)
      || (filters.validity === "expired" && validUntil < today)
      || (filters.validity === "expiring" && validUntil >= today && validUntil <= expiringThrough);
    return matchesQuery && matchesStatus && matchesValidity;
  });
}

function getSeoulDateKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  }).format(date);
}

function formatKoreanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(date);
}

function PipelineBasisPanel({
  companyId,
  conversionRate,
  expectedRevenue,
  itemCount,
  quoteRequests,
  weightedRevenue
}: {
  companyId: string;
  conversionRate: number;
  expectedRevenue: number;
  itemCount: number;
  quoteRequests: number;
  weightedRevenue: number;
}) {
  const items = [
    { label: "방문", value: `${itemCount.toLocaleString()}건`, helper: "기록 기준" },
    { label: "견적", value: `${quoteRequests.toLocaleString()}건`, helper: "후속 대상" },
    { label: "예상", value: `${expectedRevenue.toLocaleString()}만원`, helper: "후보 합계" },
    { label: "가중", value: `${weightedRevenue.toLocaleString()}만원`, helper: "확률 반영" },
    { label: "전환", value: `${conversionRate}%`, helper: "상태 기준" }
  ];
  const withCompanyQuery = (href: string) => (companyId ? `${href}?companyId=${encodeURIComponent(companyId)}` : href);
  const actionLinks = [
    { href: withCompanyQuery("/crm/timeline"), icon: FileText, label: "메모 보완" },
    { href: withCompanyQuery("/revenue/transactions"), icon: ReceiptText, label: "원장 확인" },
    { href: withCompanyQuery("/dashboard"), icon: Route, label: "지도 홈" }
  ];

  return (
    <details className="maju-section-card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="maju-section-title">집계 기준</p>
          <p className="mt-1 text-xs font-medium text-slate-500">방문 결과·견적 상태·전환 확률 산정 기준</p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-700">
          기준 확인
          <ArrowRight className="h-4 w-4 transition group-open:rotate-90" />
        </span>
      </summary>
      {/*
        세 번째 칸을 auto로 두면 flex-wrap 버튼 묶음의 줄바꿈 전 최대 너비를 기준으로 트랙 크기가
        고정돼, 가운데 설명 문단(minmax(0,1fr))이 극단적으로 눌려 한 글자씩 줄바꿈되는 문제가
        있었습니다. minmax(0,auto)로 바꿔 필요할 때는 줄어들 수 있게 했습니다.
      */}
      <div className="grid gap-3 border-y border-slate-200/80 bg-slate-50/70 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,auto)] xl:items-center">
        <div>
          <p className="maju-section-title">집계 기준</p>
          <p className="mt-1 maju-muted-label normal-case tracking-normal">방문 결과 기반</p>
        </div>
        <p className="text-sm font-medium leading-6 text-slate-600">확정 매출이 아닌 실행 후보입니다. 견적 요청과 관심 거래처부터 처리합니다.</p>
        <div className="flex flex-wrap gap-2">
          {actionLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="maju-button-secondary" href={item.href} key={item.label}>
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            );
          })}
        </div>
      </div>
      <div className="grid divide-y divide-slate-100 md:grid-cols-5 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div className="min-w-0 px-4 py-3" key={item.label}>
            <p className="maju-muted-label">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{item.value}</p>
            <p className="mt-1 truncate text-xs font-medium text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-200/80 p-4 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="maju-muted-label">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PipelineActionCard({
  description,
  href,
  label,
  tone,
  value
}: {
  description: string;
  href: string;
  label: string;
  tone: "amber" | "emerald" | "teal";
  value: string;
}) {
  const toneClassName = {
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-800",
    amber: "border-amber-200 bg-amber-50/80 text-amber-900",
    teal: "border-teal-100 bg-teal-50/70 text-teal-800"
  }[tone];

  return (
    <Link className={`group block border-b border-slate-200 p-4 transition hover:brightness-[0.98] lg:border-b-0 lg:border-r last:lg:border-r-0 ${toneClassName}`} href={href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold opacity-70">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
        <Badge className="inline-flex items-center gap-1 bg-white/80 text-slate-700">
          작업 열기
          <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
        </Badge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
    </Link>
  );
}

function PipelineLine({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm font-bold">
        <span>{label}</span>
        <span>{value}건</span>
      </div>
      <Progress value={percent} />
    </div>
  );
}
