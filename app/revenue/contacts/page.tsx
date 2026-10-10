import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, CalendarClock, CheckCircle2, FileText, History, Phone, Search, Smartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesWorkspaceNav } from "@/components/sales-workspace-nav";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { listSalesContactLedger, type SalesContactLedgerItem } from "@/lib/store";

type DueFilter = "all" | "overdue" | "today" | "upcoming" | "none";
type StageFilter = "all" | "contacted" | "quoted" | "conversion-pending" | "converted";

export default async function SalesContactsPage({
  searchParams
}: {
  searchParams?: Promise<{ action?: string; assignee?: string; companyId?: string; due?: string; from?: string; q?: string; region?: string; stage?: string; to?: string }>;
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
  const stage = isStageFilter(params?.stage) ? params.stage : "all";
  const assignee = params?.assignee?.trim() || "";
  const region = params?.region?.trim() || "";
  const from = isDateKey(params?.from) ? params.from : "";
  const to = isDateKey(params?.to) ? params.to : "";
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
    const matchesAssignee = !assignee || item.actorName === assignee;
    const matchesRegion = !region || item.address?.startsWith(region);
    const createdDate = getSeoulDateKey(new Date(item.createdAt));
    const matchesDate = (!from || createdDate >= from) && (!to || createdDate <= to);
    const matchesStage = stage === "all"
      || (stage === "contacted" && !item.quoteIssuedAt && !item.customerId)
      || (stage === "quoted" && Boolean(item.quoteIssuedAt))
      || (stage === "conversion-pending" && Boolean(item.quoteIssuedAt && !item.customerId))
      || (stage === "converted" && Boolean(item.customerId));
    const followUpDate = item.followUpAt?.slice(0, 10);
    const matchesDue = due === "all"
      || (due === "none" && !followUpDate)
      || (due === "overdue" && Boolean(followUpDate && followUpDate < today))
      || (due === "today" && followUpDate === today)
      || (due === "upcoming" && Boolean(followUpDate && followUpDate > today));
    return matchesQuery && matchesAction && matchesAssignee && matchesRegion && matchesDate && matchesStage && matchesDue;
  });
  const overdueCount = items.filter((item) => item.followUpAt?.slice(0, 10) && item.followUpAt.slice(0, 10) < today).length;
  const todayCount = items.filter((item) => item.followUpAt?.slice(0, 10) === today).length;
  const reminderCount = items.filter((item) => Boolean(item.followUpAt)).length;
  const uniqueLeads = Array.from(new Map(items.map((item) => [item.leadId, item])).values());
  const quotedCount = uniqueLeads.filter((item) => Boolean(item.quoteIssuedAt)).length;
  const conversionPendingCount = uniqueLeads.filter((item) => Boolean(item.quoteIssuedAt && !item.customerId)).length;
  const convertedCount = uniqueLeads.filter((item) => Boolean(item.customerId)).length;
  const assignees = Array.from(new Set(items.map((item) => item.actorName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko-KR"));
  const regions = Array.from(new Set(items.map((item) => getRegion(item.address)).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko-KR"));
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
        <SalesWorkspaceNav
          active="contacts"
          companyId={companyId}
          contactCount={items.length}
          showProducts={Boolean(adminSession || (customerSession && customerHasCapability(customerSession, "manage_sales")))}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={History} label="전체 컨택" tone="teal" value={items.length} />
          <SummaryCard icon={BellRing} label="기한 지난 리마인드" tone="rose" value={overdueCount} />
          <SummaryCard icon={CalendarClock} label="오늘 후속 연락" tone="amber" value={todayCount} />
          <SummaryCard icon={FileText} label="견적 발행 리드" tone="violet" value={quotedCount} />
          <SummaryCard icon={CheckCircle2} label={`전환 대기 ${conversionPendingCount} · 완료`} tone="blue" value={convertedCount} />
        </section>

        <section className="maju-section-card overflow-hidden">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">모바일 컨택 전체 흐름</p>
              <p className="mt-1 text-sm text-slate-500">리마인드 {reminderCount.toLocaleString()}건 · 만료 일정은 붉은색으로 우선 표시합니다.</p>
            </div>
            <Link className="maju-button-secondary min-h-10" href={scoped("/mobile/sales")}><Smartphone className="h-4 w-4" />모바일 영업</Link>
          </div>

          <form className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4" method="get">
            {companyId ? <input name="companyId" type="hidden" value={companyId} /> : null}
            <label>
              <span className="maju-muted-label">검색</span>
              <span className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
                <Search className="h-4 w-4 text-slate-400" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" defaultValue={query} name="q" placeholder="매장명, 주소, 담당자, 메모" type="search" />
              </span>
            </label>
            <FilterSelect label="담당자" name="assignee" value={assignee} options={assignees} emptyLabel="전체 담당자" />
            <FilterSelect label="지역" name="region" value={region} options={regions} emptyLabel="전체 지역" />
            <label>
              <span className="maju-muted-label">액션 유형</span>
              <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={action} name="action">
                <option value="">전체 액션</option><option value="call">전화</option><option value="dm">DM</option><option value="visit">방문</option><option value="quote">견적</option><option value="hold">보류</option><option value="exclude">제외</option>
              </select>
            </label>
            <label><span className="maju-muted-label">영업 단계</span><select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={stage} name="stage"><option value="all">전체 단계</option><option value="contacted">컨택 진행</option><option value="quoted">견적 발행</option><option value="conversion-pending">전환 대기</option><option value="converted">거래처 전환</option></select></label>
            <label><span className="maju-muted-label">기록 시작일</span><input className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={from} name="from" type="date" /></label>
            <label><span className="maju-muted-label">기록 종료일</span><input className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={to} name="to" type="date" /></label>
            <label>
              <span className="maju-muted-label">후속 일정</span>
              <select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={due} name="due">
                <option value="all">전체 일정</option><option value="overdue">기한 지남</option><option value="today">오늘</option><option value="upcoming">예정</option><option value="none">일정 없음</option>
              </select>
            </label>
            <div className="flex items-end gap-2"><button className="maju-button-primary min-h-11 flex-1 justify-center" type="submit">조회</button><Link className="maju-button-secondary min-h-11 flex-1 justify-center" href={scoped("/revenue/contacts")}>초기화</Link></div>
          </form>

          {loadError ? <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{loadError}</div> : null}
          {!loadError && visibleItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">매장</th><th className="px-4 py-3">리드 → 거래처</th><th className="px-4 py-3">액션·결과</th><th className="px-4 py-3">메모</th><th className="px-4 py-3">담당자</th><th className="px-4 py-3">후속 연락</th><th className="px-4 py-3">기록일</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleItems.map((item) => <ContactRow customerLedgerHref={scoped("/customers/data")} item={item} key={item.id} today={today} />)}</tbody>
              </table>
            </div>
          ) : !loadError ? <div className="px-5 py-12 text-center"><p className="font-semibold text-slate-950">조건에 맞는 컨택 기록이 없습니다.</p><p className="mt-1 text-sm text-slate-500">모바일 영업에서 기록하면 회사별 원장에 자동으로 쌓입니다.</p></div> : null}
        </section>
      </section>
    </CustomerAppShell>
  );
}

function ContactRow({ customerLedgerHref, item, today }: { customerLedgerHref: string; item: SalesContactLedgerItem; today: string }) {
  const followUpDate = item.followUpAt?.slice(0, 10);
  const overdue = Boolean(followUpDate && followUpDate < today);
  const dueToday = followUpDate === today;
  return <tr className={overdue ? "bg-rose-50/70" : dueToday ? "bg-amber-50/70" : "bg-white"}>
    <td className="px-4 py-3"><p className="font-bold text-slate-950">{item.businessName}</p><p className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{item.address || "주소 미등록"}</p>{item.phone ? <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700" href={`tel:${item.phone}`}><Phone className="h-3 w-3" />{item.phone}</a> : null}</td>
    <td className="px-4 py-3"><SalesStage customerLedgerHref={customerLedgerHref} item={item} /></td>
    <td className="px-4 py-3"><Badge className={actionTone(item.actionType)}>{actionLabel(item.actionType)}</Badge><p className="mt-1.5 text-sm font-semibold text-slate-700">{item.result || item.leadStatus}</p></td>
    <td className="max-w-[360px] px-4 py-3"><p className="line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-700">{stripReminderMarker(item.memo) || "메모 없음"}</p>{item.collateralTypes.length ? <p className="mt-1 text-xs font-semibold text-slate-500">전달: {item.collateralTypes.join(", ")}</p> : null}</td>
    <td className="px-4 py-3 text-sm font-semibold text-slate-700"><span className="inline-flex items-center gap-1"><UserRound className="h-4 w-4 text-slate-400" />{item.actorName || "미기록"}</span></td>
    <td className="px-4 py-3">{followUpDate ? <div><Badge className={overdue ? "bg-rose-100 text-rose-800" : dueToday ? "bg-amber-100 text-amber-900" : "bg-blue-50 text-blue-700"}>{overdue ? "기한 지남" : dueToday ? "오늘" : "예정"}</Badge><p className={`mt-1.5 text-sm font-bold ${overdue ? "text-rose-700" : "text-slate-800"}`}>{formatKoreanDate(item.followUpAt!)}</p></div> : <span className="text-sm text-slate-400">일정 없음</span>}</td>
    <td className="px-4 py-3 text-sm text-slate-600">{formatKoreanDateTime(item.createdAt)}</td>
  </tr>;
}

function SummaryCard({ icon: Icon, label, tone, value }: { icon: typeof History; label: string; tone: "amber" | "blue" | "rose" | "teal" | "violet"; value: number }) {
  const tones = { amber: "bg-amber-50 text-amber-800", blue: "bg-blue-50 text-blue-700", rose: "bg-rose-50 text-rose-700", teal: "bg-teal-50 text-teal-800", violet: "bg-violet-50 text-violet-700" };
  return <div className="maju-section-card flex items-center gap-3 p-4"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-black text-slate-950">{value.toLocaleString()}건</p></div></div>;
}

function SalesStage({ customerLedgerHref, item }: { customerLedgerHref: string; item: SalesContactLedgerItem }) {
  const steps = [
    { done: true, label: "컨택" },
    { done: Boolean(item.quoteIssuedAt), label: "견적" },
    { done: Boolean(item.customerId), label: "전환" }
  ];
  return <div className="min-w-[180px]"><div className="flex items-center gap-1">{steps.map((step, index) => <span className="contents" key={step.label}>{index ? <span className={`h-px w-3 ${step.done ? "bg-teal-500" : "bg-slate-200"}`} /> : null}<span className={`rounded-full px-2 py-1 text-[11px] font-bold ${step.done ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-400"}`}>{step.label}</span></span>)}</div><p className="mt-1.5 text-xs font-semibold text-slate-500">{item.customerId ? "거래처 전환 완료" : item.quoteIssuedAt ? `전환 대기 · ${quoteStatusLabel(item.quoteStatus)}` : "컨택 진행 중"}</p>{item.customerId ? <Link className="mt-1 inline-block text-xs font-bold text-teal-700" href={customerLedgerHref}>거래처 원장 보기</Link> : null}</div>;
}

function FilterSelect({ emptyLabel, label, name, options, value }: { emptyLabel: string; label: string; name: string; options: string[]; value: string }) {
  return <label><span className="maju-muted-label">{label}</span><select className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" defaultValue={value} name={name}><option value="">{emptyLabel}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function isDueFilter(value?: string): value is DueFilter { return value === "all" || value === "overdue" || value === "today" || value === "upcoming" || value === "none"; }
function isStageFilter(value?: string): value is StageFilter { return value === "all" || value === "contacted" || value === "quoted" || value === "conversion-pending" || value === "converted"; }
function isDateKey(value?: string): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function getRegion(address?: string) { return address?.trim().split(/\s+/).slice(0, 2).join(" ") || undefined; }
function quoteStatusLabel(value?: SalesContactLedgerItem["quoteStatus"]) { return ({ accepted: "수락", cancelled: "취소", draft: "작성 중", expired: "만료", rejected: "거절", sent: "발송" } as const)[value || "sent"]; }
function actionLabel(value: string) { return ({ call: "전화", dm: "DM", exclude: "제외", hold: "보류", quote: "견적", visit: "방문" } as Record<string, string>)[value] || value; }
function actionTone(value: string) { return value === "quote" ? "bg-violet-50 text-violet-700" : value === "exclude" ? "bg-rose-50 text-rose-700" : value === "visit" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-800"; }
function stripReminderMarker(value?: string) { return value?.replace(/\n?\[리마인드:\s*\d{4}-\d{2}-\d{2}\]/g, "").trim(); }
function getSeoulDateKey(date: Date) { return new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(date); }
function formatKoreanDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value)); }
function formatKoreanDateTime(value: string) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)); }
