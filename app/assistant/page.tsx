import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardEdit, FileText, MessageSquareText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getSalesAssistantDrafts } from "@/lib/store";

const typeLabels = {
  "follow-up": "후속 메시지",
  quote: "견적 메모",
  summary: "방문 요약"
};

export default async function SalesAssistantPage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const drafts = await getSalesAssistantDrafts(companyId);
  const followUps = drafts.filter((draft) => draft.type === "follow-up").length;
  const quotes = drafts.filter((draft) => draft.type === "quote").length;
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const assistantActions = [
    {
      description: "방문 결과와 메모를 기준으로 고객에게 보낼 후속 문장을 정리합니다.",
      href: companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline",
      label: "방문 기록 확인",
      value: `${drafts.length}개 초안`
    },
    {
      description: "견적 요청 건은 매출 파이프라인에서 금액과 다음 액션으로 관리합니다.",
      href: companyId ? `/revenue/pipeline?companyId=${encodeURIComponent(companyId)}` : "/revenue/pipeline",
      label: "견적 후속 관리",
      value: `${quotes}건`
    },
    {
      description: "오늘 방문할 거래처를 정하고 차량별 코스와 경유 순서를 확인합니다.",
      href: companyId ? `/routes/today?companyId=${encodeURIComponent(companyId)}` : "/routes/today",
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
      rightAction={
        <Link className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800" href={customerSession ? "/dashboard" : "/admin/companies"}>
          돌아가기
        </Link>
      }
      subtitle="방문 결과를 바탕으로 메시지, 요약, 견적 요청 메모를 생성합니다."
      title="영업 후속 작업 초안"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-5 px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <p className="text-sm font-black text-slate-950">AI 영업 후속함</p>
              <p className="mt-1 text-xs font-bold text-slate-500">방문 기록, 견적 요청, 코스 데이터를 보고 바로 실행할 초안을 정리합니다.</p>
            </div>
            <Badge className={drafts.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{drafts.length ? "초안 생성됨" : "방문 기록 필요"}</Badge>
          </div>
          <div className="grid md:grid-cols-3">
            <Metric icon={Sparkles} label="생성 초안" value={`${drafts.length}개`} />
            <Metric icon={MessageSquareText} label="후속 메시지" value={`${followUps}개`} />
            <Metric icon={FileText} label="견적 메모" value={`${quotes}개`} />
          </div>
        </div>

        <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-3">
          {assistantActions.map((action) => (
            <AssistantActionCard key={action.label} {...action} />
          ))}
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                <ClipboardEdit className="h-5 w-5 text-teal-700" />
                초안 목록
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">거래처별 후속 메시지, 견적 메모, 방문 요약을 검토합니다.</p>
            </div>
            <Badge className="bg-slate-900 text-white">{drafts.length.toLocaleString()}개 표시</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {drafts.map((draft) => (
              <article key={draft.id} className="grid gap-4 p-5 hover:bg-slate-50/60 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-teal-100 text-teal-800">{typeLabels[draft.type]}</Badge>
                    <Badge className="bg-slate-100 text-slate-700">{draft.region}</Badge>
                  </div>
                  <p className="truncate text-sm font-black text-slate-950">{draft.leadName}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">영업 후속 대상</p>
                </div>
                <div className="min-w-0">
                  <p className="font-black text-slate-950">{draft.title}</p>
                  <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">{draft.body}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-black text-slate-400">다음 액션</p>
                  <p className="mt-2 text-sm font-black leading-6 text-slate-950">{draft.nextAction}</p>
                </div>
              </article>
            ))}
            {!drafts.length ? (
              <div className="p-10 text-center">
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-teal-700" />
                <p className="font-black text-slate-950">생성할 후속 초안이 없습니다.</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">방문 결과를 먼저 기록하면 초안이 생성됩니다.</p>
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
    <Link className="group border-b border-slate-200 p-4 transition hover:bg-teal-50/40 lg:border-b-0 lg:border-r last:lg:border-r-0" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xl font-black text-slate-950">{value}</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">연결</Badge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
      <span className="mt-4 inline-flex text-xs font-black text-teal-800 transition group-hover:translate-x-0.5">바로가기</span>
    </Link>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Sparkles; label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}
