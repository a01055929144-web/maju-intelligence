import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardEdit, Download, Sparkles } from "lucide-react";
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

export default async function SalesAssistantPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const drafts = await getSalesAssistantDrafts(companyId);
  const followUps = drafts.filter((draft) => draft.type === "follow-up").length;
  const quotes = drafts.filter((draft) => draft.type === "quote").length;
  const hasLiveDraftData = drafts.length > 0;
  const isAdminPreview = Boolean(adminSession && !customerSession);
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
      subtitle="방문 기록으로 후속 문장과 견적 메모를 만듭니다."
      title="AI 영업"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-3 py-3 sm:px-4 sm:py-4">
        <div className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">영업 초안 작업 흐름</p>
              <p className="mt-1 text-sm text-slate-500">기록 확인 → 초안 검토 → 후속 업무 순서로 진행하세요.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={hasLiveDraftData ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                {hasLiveDraftData ? "실제 방문 기록 기반" : "방문 기록 필요"}
              </Badge>
              <span className="text-sm font-semibold text-slate-700">초안 {drafts.length.toLocaleString()}개</span>
              <span className="text-sm text-slate-400">후속 {followUps} · 견적 {quotes}</span>
            </div>
          </div>
          <div className="grid sm:grid-cols-3">
            {assistantActions.map((action) => (
              <AssistantActionCard key={action.label} {...action} />
            ))}
          </div>
        </div>

        <section className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-950">
                <ClipboardEdit className="h-5 w-5 text-teal-700" />
                검토할 초안
              </h2>
              <p className="mt-1 text-sm text-slate-500">내용을 확인한 뒤 복사하거나 파일로 저장하세요.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={hasLiveDraftData ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
                {hasLiveDraftData ? "실제 방문 기록 기반" : "실데이터 없음"}
              </Badge>
              <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{drafts.length.toLocaleString()}개</Badge>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {drafts.map((draft) => (
              <article key={draft.id} className="grid gap-4 p-4 transition-colors hover:bg-slate-50/60 sm:p-5 xl:grid-cols-[200px_minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-teal-100 text-teal-800">{typeLabels[draft.type]}</Badge>
                    <Badge className="bg-slate-100 text-slate-700">{draft.region}</Badge>
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-950">{draft.leadName}</p>
                  <p className="mt-1 text-xs text-slate-500">후속 영업 대상</p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-950">{draft.title}</p>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                      <CopyTextButton className="w-full justify-center sm:w-auto" text={draft.body} />
                      <a
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        download={`영업-초안-${draft.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`}
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(`\uFEFF${draft.title}\n거래처: ${draft.leadName}\n지역: ${draft.region}\n유형: ${typeLabels[draft.type]}\n\n${draft.body}\n\n다음 액션: ${draft.nextAction}\n`)}`}
                        aria-label={`${draft.leadName} ${draft.title} 텍스트 저장`}
                      >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" />
                        텍스트 저장
                      </a>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{draft.body}</p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-3">
                  <p className="text-xs font-semibold text-teal-800">복사·저장 후 다음 액션</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{draft.nextAction}</p>
                </div>
              </article>
            ))}
            {!drafts.length ? (
              <div className="p-8 text-center sm:p-12">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-teal-700" />
                <p className="font-semibold text-slate-950">검토할 초안이 없습니다.</p>
                <p className="mt-1 text-sm text-slate-500">방문 결과와 메모를 남기면 후속 문장과 견적 메모가 생성됩니다.</p>
                <Link
                  className="maju-button-primary mt-5"
                  href={companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline"}
                >
                  방문 기록 작성
                  <ArrowRight className="h-4 w-4" />
                </Link>
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
    <Link className="group border-b border-slate-200 p-4 transition hover:bg-teal-50/40 sm:border-b-0 sm:border-r last:sm:border-r-0" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">연결</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 transition group-hover:translate-x-0.5">
        바로가기 <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
