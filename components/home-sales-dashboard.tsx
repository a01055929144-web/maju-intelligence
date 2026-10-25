import Link from "next/link";
import { ArrowRight, CalendarClock, Map, MessageSquareText, Route, Store, TriangleAlert } from "lucide-react";
import type { SalesHomeSummary } from "@/application/analytics/sales-home-summary";

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

export function HomeSalesDashboard({ delivery, summary }: { delivery: DeliverySummary; summary: SalesHomeSummary }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-teal-700">오늘의 영업 운영</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">오늘 할 일</h1>
          <p className="mt-2 text-sm text-slate-500">신규 리드부터 재연락, 방문, 배송 코스까지 한곳에서 확인하세요.</p>
        </div>
        <div className="flex gap-2">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700" href="/map"><Map className="h-4 w-4" />지도</Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white" href="/mobile/sales"><Route className="h-4 w-4" />모바일 영업</Link>
        </div>
      </header>

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

      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center">
        <div><p className="text-sm font-semibold text-teal-300">오늘 배송 운영</p><p className="mt-1 text-xl font-bold">{delivery.groups}개 권역 · {delivery.stops}곳 코스</p><p className="mt-1 text-xs text-slate-300">배송 코스는 영업 홈과 분리되어 기존 운영 흐름을 그대로 유지합니다.</p></div>
        <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900" href="/routes/today">오늘 코스 보기 <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}
