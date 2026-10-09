import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, FileText, History, Phone, Search, Smartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { WorkspaceSectionNav } from "@/components/workspace-section-nav";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { listSalesContactLedger, type SalesContactLedgerItem } from "@/lib/store";

type DueFilter = "all" | "overdue" | "today" | "upcoming" | "none";

export default async function SalesContactsPage({
  searchParams
}: {
  searchParams?: Promise<{ action?: string; companyId?: string; due?: string; q?: string }>;
}) {
  const params = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !params?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, params?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const query = params?.q?.trim() || "";
  const action = params?.action?.trim() || "";
  const due = isDueFilter(params?.due) ? params.due : "all";
  let items: SalesContactLedgerItem[] = [];
  let loadError = "";
  try {
    items = companyId ? await listSalesContactLedger(companyId) : [];
  } catch (error) {
    loadError = error instanceof Error ? error.message : "컨택 원장을 불러오지 못했습니다.";
  }

  const today = getSeoulDateKey(new Date());
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const visibleItems = items.filter((item) => {
    const matchesQuery = !normalizedQuery || [item.businessName, item.address, item.phone, item.actorName, item.memo, item.result]
      .some((value) => value?.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    const matchesAction = !action || item.actionType === action;
    const followUpDate = item.followUpAt?.slice(0, 10);
    const matchesDue = due === "all"
      || (due === "none" && !followUpDate)
      || (due === "overdue" && Boolean(followUpDate && followUpDate < today))
      || (due === "today" && followUpDate === today)
      || (due === "upcoming" && Boolean(followUpDate && followUpDate > today));
    return matchesQuery && matchesAction && matchesDue;
  });
  const overdueCount = items.filter((item) => item.followUpAt?.slice(0, 10) && item.followUpAt.slice(0, 10) < today).length;
  const todayCount = items.filter((item) => item.followUpAt?.slice(0, 10) === today).length;
  const reminderCount = items.filter((item) => Boolean(item.followUpAt)).length;
  const scoped = (path: string) => companyId ? `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}` : path;

  return (
    <CustomerAppShell
      active="sales-contacts"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="모바일 영업에서 남긴 컨택과 후속 연락일을 한곳에서 관리합니다."
      title="컨택·리마인드 원장"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <WorkspaceSectionNav
          items={[
            { description: "예상매출과 전환", href: scoped("/revenue/pipeline"), icon: FileText, label: "영업 현황" },
            { active: true, badge: `${items.length}건`, description: "컨택·후속 일정", href: scoped("/revenue/contacts"), icon: History, label: "컨택 원장" },
            { description: "발행·유효기간·공유", href: scoped("/revenue/pipeline?section=quotes"), icon: CalendarClock, label: "견적 원장" }
          ]}
          title="영업 관리"
        />

        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard icon={History} label="전체 컨택" tone="teal" value={items.length} />
          <SummaryCard icon={BellRing} label="기한 지난 리마인드" tone="rose" value={overdueCount} />
          <SummaryCard icon={CalendarClock} label="오늘 후속 연락" tone="amber" value={todayCount} />
        </section>

        <section className="maju-section-card overflow-hidden">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">모바일 컨택 전체 흐름</p>
              <p className="mt-1 text-sm text-slate-500">리마인드 {reminderCount.toLocaleString()}건 · 만료 일정은 붉은색으로 우선 표시합니다.</p>
            </div>
            <Link className="maju-button-secondary min-h-10" href="/mobile/sales"><Smartphone className="h-4 w-4" />모바일 영업</Link>
          </div>

          <form className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto] lg:items-end" method="get">
            {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
            <label>
              <span className="maju-muted-label">검색</span>
              <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
                <Search className="h-4 w-4 text-slate-400" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" defaultValue={query} name="q" placeholder="매장명, 주소, 담당자, 메모" type="search" />
              </span>
            </label>
            <label>
              <span className="maju-muted-label">액션 유형</span>
              <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={action} name="action">
                <option value="">전체 액션</option><option value="call">전화</option><option value="dm">DM</option><option value="visit">방문</option><option value="quote">견적</option><option value="hold">보류</option><option value="exclude">제외</option>
              </select>
            </label>
            <label>
              <span className="maju-muted-label">후속 일정</span>
              <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={due} name="due">
                <option value="all">전체 일정</option><option value="overdue">기한 지남</option><option value="today">오늘</option><option value="upcoming">예정</option><option value="none">일정 없음</option>
              </select>
            </label>
            <div className="flex gap-2"><button className="maju-button-primary min-h-11 flex-1 justify-center" type="submit">조회</button><Link className="maju-button-secondary min-h-11 flex-1 justify-center" href={scoped("/revenue/contacts")}>초기화</Link></div>
          </form>

          {loadError ? <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{loadError}</div> : null}
          {!loadError && visibleItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">매장</th><th className="px-4 py-3">액션·결과</th><th className="px-4 py-3">메모</th><th className="px-4 py-3">담당자</th><th className="px-4 py-3">후속 연락</th><th className="px-4 py-3">기록일</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleItems.map((item) => <ContactRow item={item} key={item.id} today={today} />)}</tbody>
              </table>
            </div>
          ) : !loadError ? <div className="px-5 py-12 text-center"><p className="font-semibold text-slate-950">조건에 맞는 컨택 기록이 없습니다.</p><p className="mt-1 text-sm text-slate-500">모바일 영업에서 기록하면 회사별 원장에 자동으로 쌓입니다.</p></div> : null}
        </section>
      </section>
    </CustomerAppShell>
  );
}

function ContactRow({ item, today }: { item: SalesContactLedgerItem; today: string }) {
  const followUpDate = item.followUpAt?.slice(0, 10);
  const overdue = Boolean(followUpDate && followUpDate < today);
  const dueToday = followUpDate === today;
  return <tr className={overdue ? "bg-rose-50/70" : dueToday ? "bg-amber-50/70" : "bg-white"}>
    <td className="px-4 py-3"><p className="font-bold text-slate-950">{item.businessName}</p><p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{item.address || "주소 미등록"}</p>{item.phone ? <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700" href={`tel:${item.phone}`}><Phone className="h-3 w-3" />{item.phone}</a> : null}</td>
    <td className="px-4 py-3"><Badge className={actionTone(item.actionType)}>{actionLabel(item.actionType)}</Badge><p className="mt-1.5 text-sm font-semibold text-slate-700">{item.result || item.leadStatus}</p></td>
    <td className="max-w-[360px] px-4 py-3"><p className="line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-700">{stripReminderMarker(item.memo) || "메모 없음"}</p>{item.collateralTypes.length ? <p className="mt-1 text-xs font-semibold text-slate-500">전달: {item.collateralTypes.join(", ")}</p> : null}</td>
    <td className="px-4 py-3 text-sm font-semibold text-slate-700"><span className="inline-flex items-center gap-1"><UserRound className="h-4 w-4 text-slate-400" />{item.actorName || "미기록"}</span></td>
    <td className="px-4 py-3">{followUpDate ? <div><Badge className={overdue ? "bg-rose-100 text-rose-800" : dueToday ? "bg-amber-100 text-amber-900" : "bg-blue-50 text-blue-700"}>{overdue ? "기한 지남" : dueToday ? "오늘" : "예정"}</Badge><p className={`mt-1.5 text-sm font-bold ${overdue ? "text-rose-700" : "text-slate-800"}`}>{formatKoreanDate(item.followUpAt!)}</p></div> : <span className="text-sm text-slate-400">일정 없음</span>}</td>
    <td className="px-4 py-3 text-sm text-slate-600">{formatKoreanDateTime(item.createdAt)}</td>
  </tr>;
}

function SummaryCard({ icon: Icon, label, tone, value }: { icon: typeof History; label: string; tone: "amber" | "rose" | "teal"; value: number }) {
  const tones = { amber: "bg-amber-50 text-amber-800", rose: "bg-rose-50 text-rose-700", teal: "bg-teal-50 text-teal-800" };
  return <div className="maju-section-card flex items-center gap-3 p-4"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-black text-slate-950">{value.toLocaleString()}건</p></div></div>;
}

function isDueFilter(value?: string): value is DueFilter { return value === "all" || value === "overdue" || value === "today" || value === "upcoming" || value === "none"; }
function actionLabel(value: string) { return ({ call: "전화", dm: "DM", exclude: "제외", hold: "보류", quote: "견적", visit: "방문" } as Record<string, string>)[value] || value; }
function actionTone(value: string) { return value === "quote" ? "bg-violet-50 text-violet-700" : value === "exclude" ? "bg-rose-50 text-rose-700" : value === "visit" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-800"; }
function stripReminderMarker(value?: string) { return value?.replace(/\n?\[리마인드:\s*\d{4}-\d{2}-\d{2}\]/g, "").trim(); }
function getSeoulDateKey(date: Date) { return new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(date); }
function formatKoreanDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value)); }
function formatKoreanDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }
