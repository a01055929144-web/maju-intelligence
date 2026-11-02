import Link from "next/link";
import { ArrowRight, CalendarClock, FileWarning, Map, MessageSquareText, MousePointerClick, Route, Store, TriangleAlert } from "lucide-react";
import type { SalesHomeSummary } from "@/application/analytics/sales-home-summary";
import type { TodayTaskCounts } from "@/application/dashboard/today-task-counts";

type DeliverySummary = {
  groups: number;
  stops: number;
};

const taskMeta = [
  { key: "newToday", label: "새로 연 매장", description: "오늘 확인할 신규 매장", icon: Store, href: "/leads?type=permit" },
  { key: "smsReady", label: "문자 가능·미연락", description: "010 번호가 있는 미접촉 리드", icon: MessageSquareText, href: "/mobile/sales" },
  { key: "breakTimeVisit", label: "오늘 브레이크 있음", description: "방문 시간을 잡기 좋은 매장", icon: Map, href: "/leads?type=keyword" },
  { key: "followUpToday", label: "오늘 재연락", description: "후속일이 도래한 연락 기록", icon: CalendarClock, href: "/mobile/sales" },
  { key: "closureReview", label: "폐업 확인 필요", description: "상태를 확인해야 하는 매장", icon: TriangleAlert, href: "/leads?type=permit" }
] as const;

export type HomeTab = "today" | "status" | "performance";
export function isHomeTab(value?: string): value is HomeTab { return value === "today" || value === "status" || value === "performance"; }

// 0033 지시서 1절: 홈 = 한 화면, 탭 3개. 같은 숫자는 한 탭에만 둔다.
// 오늘 할 일 = 지금 처리할 일 · 현황판 = 운영 숫자 · 성과 = 영업 흐름/전환. 현황판 · 성과는 대표 · 관리자만.
export function HomeSalesDashboard({ companyQuery = "", delivery, summary, tab = "today", taskAccess, todayTasks }: {
  companyQuery?: string;
  delivery: DeliverySummary;
  summary: SalesHomeSummary;
  tab?: HomeTab;
  taskAccess: "limited" | "manager" | "sales";
  todayTasks: TodayTaskCounts;
}) {
  const canSeeBoards = taskAccess === "manager";
  const activeTab: HomeTab = canSeeBoards ? tab : "today";
  const tabs: { id: HomeTab; label: string }[] = canSeeBoards
    ? [{ id: "today", label: "오늘 할 일" }, { id: "status", label: "현황판" }, { id: "performance", label: "성과" }]
    : [];
  const urgentTasks = [
    ...(taskAccess === "manager" && todayTasks.highInterest > 0 ? [{ count: todayTasks.highInterest, description: "최근 열람이 3회 이상이지만 아직 주문하지 않은 매장", href: "/revenue/pricing/links", icon: MousePointerClick, label: "관심 높음" }] : []),
    ...((taskAccess === "manager" || taskAccess === "sales") && summary.tasks.followUpToday > 0 ? [{ count: summary.tasks.followUpToday, description: "약속한 연락일이 오늘이거나 이미 지난 매장", href: "/mobile/sales#reminders", icon: CalendarClock, label: "오늘 다시 연락할 곳" }] : []),
    ...(taskAccess === "manager" && todayTasks.documentRecalculation > 0 ? [{ count: todayTasks.documentRecalculation, description: "매입가 변경을 반영해 다시 확인해야 하는 문서", href: "/revenue/pricing/documents", icon: FileWarning, label: "다시 계산 필요 문서" }] : []),
  ];
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-teal-700">홈</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{activeTab === "status" ? "현황판" : activeTab === "performance" ? "성과" : "오늘 할 일"}</h1>
          {tabs.length ? <nav aria-label="홈 보기" className="mt-3 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">{tabs.map((item) => <Link aria-current={activeTab === item.id ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === item.id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`} href={`/dashboard?tab=${item.id}${companyQuery}`} key={item.id}>{item.label}</Link>)}</nav> : null}
        </div>
        <div className="flex gap-2">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700" href="/map"><Map className="h-4 w-4" />지도</Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white" href="/mobile/sales"><Route className="h-4 w-4" />모바일 영업</Link>
        </div>
      </header>

      {activeTab === "today" ? <>
      <section aria-labelledby="today-tasks-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-950" id="today-tasks-title">오늘 할 일</h2><p className="mt-1 text-sm text-slate-500">급한 업무만 모았습니다. 완료되면 목록에서 자동으로 사라집니다.</p></div>
          {urgentTasks.length ? <span className="shrink-0 text-sm font-bold tabular-nums text-teal-700">{urgentTasks.length}개 업무</span> : null}
        </div>
        {todayTasks.unavailable ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900" role="status">일부 업무를 불러오지 못했습니다. 다른 업무는 그대로 진행할 수 있습니다. 잠시 뒤 새로고침해 주세요.</p> : null}
        {urgentTasks.length ? <div className="mt-4 divide-y divide-slate-100">{urgentTasks.map(({ count, description, href, icon: Icon, label }) => (
          <Link className="group flex min-h-16 items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2" href={href} key={label}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon aria-hidden="true" className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-950">{label} <span className="tabular-nums text-teal-700">{count}건</span></strong><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span>
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
          </Link>
        ))}</div> : <div className="mt-4 rounded-xl bg-slate-50 px-4 py-5 text-center"><p className="text-sm font-semibold text-slate-800">지금 바로 확인할 급한 업무가 없습니다.</p><p className="mt-1 text-xs text-slate-500">새 업무가 생기면 이곳에 표시됩니다.</p></div>}
        {taskAccess === "limited" ? <p className="mt-3 text-xs font-semibold text-slate-500">현재 역할에서 확인할 수 있는 업무만 표시합니다.</p> : null}
      </section>


      <div className="grid gap-5 lg:grid-cols-2">
        <LeadPreviewList empty="최근 들어온 리드가 없습니다." items={summary.leadPreviews.newest} title="새로 들어옴" type="permit" />
        <LeadPreviewList empty="확인할 영업 리드가 없습니다." items={summary.leadPreviews.highInterest} title="관심 높음" type="keyword" />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="오늘 할 일 요약">
        {taskMeta.map(({ description, href, icon: Icon, key, label }) => (
          <Link className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md" href={href} key={key}>
            <div className="flex items-start justify-between gap-3"><Icon className="h-5 w-5 text-teal-700" /><span className="text-2xl font-bold text-slate-950">{summary.tasks[key]}</span></div>
            <p className="mt-4 text-sm font-semibold text-slate-900">{label}</p>
            <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700">확인하기 <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </section>
      </> : null}

      {activeTab === "status" ? <>
      <section aria-labelledby="today-numbers-title">
        <h2 className="mb-3 text-base font-bold text-slate-950" id="today-numbers-title">오늘 숫자</h2>
        <div className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-2xl bg-violet-700 p-5 text-white shadow-sm transition hover:bg-violet-800" href="/leads?type=permit">
          <p className="text-sm font-semibold text-violet-100">신규 리드 · 최근 7일</p>
          <p className="mt-2 text-3xl font-bold">{summary.leadOverview.newThisWeek}곳</p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold">새로 들어온 매장 보기 <ArrowRight className="h-3.5 w-3.5" /></span>
        </Link>
        <Link className="rounded-2xl bg-teal-800 p-5 text-white shadow-sm transition hover:bg-teal-900" href="/leads?type=keyword">
          <p className="text-sm font-semibold text-teal-100">영업 리드</p>
          <p className="mt-2 text-3xl font-bold">{summary.leadOverview.sales}곳</p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold">영업 후보 보기 <ArrowRight className="h-3.5 w-3.5" /></span>
        </Link>
        </div>
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center">
        <div><p className="text-sm font-semibold text-teal-300">오늘 배송 운영</p><p className="mt-1 text-xl font-bold">{delivery.groups}개 권역 · {delivery.stops}곳 코스</p><p className="mt-1 text-xs text-slate-300">배송 코스는 영업 홈과 분리되어 기존 운영 흐름을 그대로 유지합니다.</p></div>
        <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900" href="/routes/today">오늘 코스 보기 <ArrowRight className="h-4 w-4" /></Link>
      </section>
      </> : null}

      {activeTab === "performance" ? <>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold">영업 흐름</h2><p className="mt-1 text-xs text-slate-500">현재 리드 상태 기준</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">활성 {summary.totals.active}곳</span></div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {summary.funnel.map((item, index) => <div className="relative rounded-xl bg-slate-50 p-3 text-center" key={item.label}><p className="text-xl font-bold text-slate-950">{item.value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.label}</p>{index < summary.funnel.length - 1 ? <ArrowRight className="absolute -right-2 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-300" /> : null}</div>)}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm"><span className="text-slate-500">이번 달 연락한 리드</span><strong>{summary.totals.contactedThisMonth}곳</strong></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold">이번 달 채널별 연락</h2>
          <p className="mt-1 text-xs text-slate-500">lead_actions에 저장된 실제 연락 기록</p>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4">
            {summary.channelCounts.map((item) => <div className="rounded-xl bg-slate-50 px-2 py-3 text-center" key={item.key}><p className="text-lg font-bold">{item.value}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{item.label}</p></div>)}
          </div>
        </section>
      </div>
      <p className="text-sm text-slate-500">담당자별 목표 · 실적과 자세한 분석은 <Link className="font-semibold text-teal-700 underline" href={`/insights${companyQuery ? `?${companyQuery.slice(1)}` : ""}`}>성과 자세히 보기</Link>에서 확인합니다.</p>
      </> : null}





    </div>
  );
}

function LeadPreviewList({ empty, items, title, type }: { empty: string; items: SalesHomeSummary["leadPreviews"]["newest"]; title: string; type: "keyword" | "permit" }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-base font-bold">{title}</h2><span className="text-xs font-semibold text-slate-400">최대 3곳</span></div>
      {items.length ? <ul className="mt-3 divide-y divide-slate-100">{items.map((lead) => (
        <li key={lead.id}>
          <Link className="flex min-h-14 items-center justify-between gap-3 py-2 text-sm transition hover:text-teal-700" href={`/leads?type=${type}&lead=${encodeURIComponent(lead.id)}`}>
            <span className="min-w-0"><strong className="block truncate text-slate-900">{lead.businessName}</strong><span className="text-xs text-slate-500">{lead.status}</span></span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{lead.scoreTotal}점</span>
          </Link>
        </li>
      ))}</ul> : <p className="mt-3 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">{empty}</p>}
    </section>
  );
}
