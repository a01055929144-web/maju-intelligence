import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardEdit, FileText, MessageSquareText, Route, Sparkles, TrendingUp } from "lucide-react";
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
      subtitle="방문 기록과 견적 요청을 바로 쓸 문장으로 정리합니다."
      title="AI 영업"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4 sm:px-4">
        <div className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">후속 작업</p>
              <p className="mt-1 text-xs font-bold text-slate-500">방문 · 견적 기준</p>
            </div>
            <Badge className={drafts.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{drafts.length ? "초안 생성됨" : "방문 기록 필요"}</Badge>
          </div>
          <div className="grid md:grid-cols-3">
            <Metric icon={Sparkles} label="생성 초안" value={`${drafts.length}개`} />
            <Metric icon={MessageSquareText} label="후속 메시지" value={`${followUps}개`} />
            <Metric icon={FileText} label="견적 메모" value={`${quotes}개`} />
          </div>
        </div>

        <div className="grid maju-section-card lg:grid-cols-3">
          {assistantActions.map((action) => (
            <AssistantActionCard key={action.label} {...action} />
          ))}
        </div>

        <AssistantBasisPanel
          draftsCount={drafts.length}
          followUps={followUps}
          quotes={quotes}
          companyId={isAdminPreview ? companyId || "" : ""}
        />

        <section className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
                <ClipboardEdit className="h-5 w-5 text-teal-700" />
                실행 초안
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">담당자가 검토 후 사용합니다.</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{drafts.length.toLocaleString()}개</Badge>
          </div>
          <div className="divide-y divide-slate-100">
            {drafts.map((draft) => (
              <article key={draft.id} className="grid gap-4 p-4 hover:bg-slate-50/60 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-teal-100 text-teal-800">{typeLabels[draft.type]}</Badge>
                    <Badge className="bg-slate-100 text-slate-700">{draft.region}</Badge>
                  </div>
                  <p className="truncate text-sm font-black text-slate-950">{draft.leadName}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">영업 후속 대상</p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-black text-slate-950">{draft.title}</p>
                    <CopyTextButton text={draft.body} />
                  </div>
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

function AssistantBasisPanel({
  companyId,
  draftsCount,
  followUps,
  quotes
}: {
  companyId: string;
  draftsCount: number;
  followUps: number;
  quotes: number;
}) {
  const withCompanyQuery = (href: string) => (companyId ? `${href}?companyId=${encodeURIComponent(companyId)}` : href);
  const items = [
    { label: "방문 기록", value: `${draftsCount.toLocaleString()}개 초안`, helper: "메모·방문 결과 기준" },
    { label: "후속 메시지", value: `${followUps.toLocaleString()}개`, helper: "고객 응대 초안" },
    { label: "견적 메모", value: `${quotes.toLocaleString()}개`, helper: "파이프라인 연결" },
    { label: "코스 연결", value: "방문 순서 확인", helper: "현장 실행 기준" }
  ];
  const actionLinks = [
    { href: withCompanyQuery("/crm/timeline"), icon: FileText, label: "기록 보완" },
    { href: withCompanyQuery("/revenue/pipeline"), icon: TrendingUp, label: "기회 확인" },
    { href: withCompanyQuery("/dashboard"), icon: Route, label: "지도 홈" }
  ];

  return (
    <div className="maju-section-card">
      <div className="grid gap-3 border-b border-slate-200/80 bg-slate-50/70 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,auto)] xl:items-center">
        <div>
          <p className="maju-section-title">생성 기준</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">방문 결과와 영업 메모를 문장으로 정리합니다.</p>
        </div>
        <p className="text-xs font-bold leading-5 text-slate-600">
          초안 품질은 거래처 메모, 견적 상태, 방문 코스에 좌우됩니다. 발송 전 담당자 검토가 필요합니다.
        </p>
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
      <div className="grid divide-y divide-slate-100 md:grid-cols-4 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div className="min-w-0 px-4 py-3" key={item.label}>
            <p className="maju-muted-label">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
    </div>
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
    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}
