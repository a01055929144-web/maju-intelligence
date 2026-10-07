import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardEdit, Download, Search, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyTextButton } from "@/components/copy-text-button";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesAssistantDrafts } from "@/lib/store";

const typeLabels = {
  "follow-up": "후속 메시지",
  quote: "견적 메모",
  summary: "방문 요약"
};

const draftPresentation = {
  quote: {
    actionLabel: "견적 후속 열기",
    priority: "높음",
    priorityClassName: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100",
    reason: "견적 요청이 확인되어 구매 의도가 가장 명확합니다."
  },
  "follow-up": {
    actionLabel: "방문 기록 열기",
    priority: "보통",
    priorityClassName: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100",
    reason: "방문 대화를 이어갈 후속 메시지가 준비되었습니다."
  },
  summary: {
    actionLabel: "방문 기록 열기",
    priority: "참고",
    priorityClassName: "bg-slate-100 text-slate-700",
    reason: "후속 판단에 사용할 방문 결과가 정리되었습니다."
  }
} as const;

export default async function SalesAssistantPage({ searchParams }: { searchParams?: Promise<{ companyId?: string; q?: string; type?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const drafts = await getSalesAssistantDrafts(companyId);
  const query = resolvedSearchParams?.q?.trim() || "";
  const requestedType = resolvedSearchParams?.type;
  const selectedType = requestedType === "follow-up" || requestedType === "quote" || requestedType === "summary" ? requestedType : "all";
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const filteredDrafts = drafts.filter((draft) => {
    if (selectedType !== "all" && draft.type !== selectedType) return false;
    if (!normalizedQuery) return true;
    return [draft.leadName, draft.region, draft.title, draft.body, draft.nextAction, typeLabels[draft.type]]
      .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
  });
  const followUps = drafts.filter((draft) => draft.type === "follow-up").length;
  const quotes = drafts.filter((draft) => draft.type === "quote").length;
  const hasLiveDraftData = drafts.length > 0;
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const previewCompanyId = isAdminPreview ? companyId : undefined;
  const resetSearchHref = previewCompanyId ? `/assistant?companyId=${encodeURIComponent(previewCompanyId)}` : "/assistant";
  const assistantActions = [
    {
      description: "방문 메모 기반 후속 문장",
      href: companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline",
      label: "방문 기록 확인",
      value: `${drafts.length}개 초안`
    },
    {
      description: "견적 요청과 다음 액션",
      href: companyId ? `/revenue/pipeline?companyId=${encodeURIComponent(companyId)}` : "/revenue/pipeline",
      label: "견적 후속 관리",
      value: `${quotes}건`
    },
    {
      description: "오늘 방문 코스 확인",
      href: companyId ? `/dashboard?companyId=${encodeURIComponent(companyId)}` : "/dashboard",
      label: "방문 코스 연결",
      value: "코스 확인"
    }
  ];

  return (
    <CustomerAppShell
      active="assistant"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="방문 기록을 다음 영업 행동으로 연결합니다."
      title="AI 영업"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-3 py-3 sm:px-4 sm:py-5">
        <div className="maju-section-card overflow-hidden">
          <div className="maju-card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="maju-section-title">다음 영업 행동</p>
              <p className="mt-1 text-sm text-slate-500">기록을 확인하고 필요한 후속 업무를 바로 이어가세요.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={hasLiveDraftData ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                {hasLiveDraftData ? "실제 방문 기록 기반" : "방문 기록 필요"}
              </Badge>
              <span className="text-sm font-semibold text-slate-700">초안 {drafts.length.toLocaleString()}개</span>
              <span className="text-sm text-slate-400">후속 {followUps} · 견적 {quotes}</span>
            </div>
          </div>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {assistantActions.map((action) => (
              <AssistantActionCard key={action.label} {...action} />
            ))}
          </div>
        </div>

        <section className="maju-section-card">
          <div className="maju-card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <ClipboardEdit className="h-5 w-5 text-teal-700" />
                검토할 초안
              </h2>
              <p className="mt-1 text-sm text-slate-500">초안을 검토하고 복사한 뒤 표시된 후속 업무로 이동하세요.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={hasLiveDraftData ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
                {hasLiveDraftData ? "실제 방문 기록 기반" : "실데이터 없음"}
              </Badge>
              <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{drafts.length.toLocaleString()}개</Badge>
            </div>
          </div>
          <form action="/assistant" className="grid gap-2 border-b border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center" method="get" role="search">
            {previewCompanyId ? <input name="companyId" type="hidden" value={previewCompanyId} /> : null}
            <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">AI 영업 초안 검색</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:font-medium placeholder:text-slate-400"
                defaultValue={query}
                name="q"
                placeholder="거래처, 지역, 초안 내용 검색"
                type="search"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">초안 유형</span>
              <select className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" defaultValue={selectedType} name="type">
                <option value="all">전체 유형</option>
                <option value="follow-up">후속 메시지</option>
                <option value="quote">견적 메모</option>
                <option value="summary">방문 요약</option>
              </select>
            </label>
            <div className="flex min-w-0 gap-2">
              <button className="maju-button-primary min-h-11 flex-1 justify-center sm:flex-none" type="submit">검색</button>
              {query || selectedType !== "all" ? (
                <Link aria-label="검색 조건 초기화" className="maju-button-secondary min-h-11 shrink-0 justify-center px-3" href={resetSearchHref} title="검색 조건 초기화">
                  <X aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </form>
          <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-500">
            <span>검색 결과 <strong className="text-slate-950">{filteredDrafts.length.toLocaleString()}개</strong></span>
            {query ? <span className="max-w-full truncate">검색어: {query}</span> : <span>거래처·지역·내용을 한 번에 찾을 수 있습니다.</span>}
          </div>
          <div className="divide-y divide-slate-100">
            {filteredDrafts.map((draft, index) => {
              const presentation = draftPresentation[draft.type];
              const actionHref = draft.type === "quote"
                ? (companyId ? `/revenue/pipeline?companyId=${encodeURIComponent(companyId)}` : "/revenue/pipeline")
                : (companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline");

              return (
              <article key={draft.id} className="grid gap-4 p-4 transition-colors hover:bg-slate-50/60 sm:p-5 lg:grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_260px]">
                <div className="min-w-0 border-b border-slate-100 pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-teal-100 text-teal-800">{typeLabels[draft.type]}</Badge>
                    <Badge className={presentation.priorityClassName}>우선순위 {presentation.priority}</Badge>
                  </div>
                  <p className="break-words text-sm font-bold text-slate-950">{draft.leadName}</p>
                  <p className="mt-1 text-xs text-slate-500">{draft.region} · 검토 순서 {index + 1}</p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-base font-bold leading-6 text-slate-950">{draft.title}</p>
                    <span className="text-xs font-medium leading-5 text-slate-500">{presentation.reason}</span>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:p-4">
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{draft.body}</p>
                    <details className="group mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-teal-800 marker:text-teal-600">전체 내용 보기</summary>
                      <p className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200 pt-3 text-sm leading-6 text-slate-700">{draft.body}</p>
                    </details>
                  </div>
                </div>
                <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-4 lg:col-start-2 xl:col-start-auto">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />바로 실행</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{draft.nextAction}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CopyTextButton className="w-full justify-center" text={draft.body} />
                    <a
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      download={`영업-초안-${draft.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`}
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(`\uFEFF${draft.title}\n거래처: ${draft.leadName}\n지역: ${draft.region}\n유형: ${typeLabels[draft.type]}\n우선순위: ${presentation.priority}\n우선순위 사유: ${presentation.reason}\n\n${draft.body}\n\n다음 액션: ${draft.nextAction}\n`)}`}
                      aria-label={`${draft.leadName} ${draft.title} 텍스트 저장`}
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      저장
                    </a>
                  </div>
                  <Link className="maju-button-primary mt-2 w-full justify-center" href={actionHref}>
                    {presentation.actionLabel}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
              );
            })}
            {!filteredDrafts.length ? (
              <div className="px-5 py-10 text-center sm:px-8 sm:py-14">
                <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700"><Sparkles className="h-6 w-6" aria-hidden="true" /></span>
                <p className="font-semibold text-slate-950">{drafts.length ? "검색 조건과 일치하는 초안이 없습니다." : "검토할 초안이 없습니다."}</p>
                <p className="mt-1 text-sm text-slate-500">{drafts.length ? "검색어나 초안 유형을 바꿔 다시 확인하세요." : "방문 결과와 메모를 남기면 후속 문장과 견적 메모가 생성됩니다."}</p>
                {drafts.length ? (
                  <Link className="maju-button-secondary mt-5" href={resetSearchHref}>검색 조건 초기화</Link>
                ) : (
                  <Link
                    className="maju-button-primary mt-5"
                    href={companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline"}
                  >
                    방문 기록 작성
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </CustomerAppShell>
  );
}

function AssistantActionCard({
  description,
  href,
  label,
  value
}: {
  description: string;
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link className="group border-b border-slate-200 p-4 transition hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-600 sm:border-b-0 sm:border-r sm:p-5 last:sm:border-r-0" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="mt-1 text-xl font-bold text-slate-950">{value}</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">연결</Badge>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-500">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 transition group-hover:translate-x-0.5">
        작업 열기 <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
