import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, CircleDollarSign, FileText, Percent, ReceiptText, Route, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { PipelineCandidatesTable } from "@/components/pipeline-candidates-table";
import { Progress } from "@/components/ui/progress";
import { WorkspaceSectionNav } from "@/components/workspace-section-nav";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getRevenuePipeline, type RevenuePipeline } from "@/lib/store";

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

export default async function RevenuePipelinePage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  let pipeline = emptyPipeline;
  let pipelineError = "";

  try {
    pipeline = await getRevenuePipeline(companyId);
  } catch (error) {
    pipelineError = error instanceof Error ? error.message : "매출 파이프라인을 불러오지 못했습니다.";
  }

  const isAdminPreview = Boolean(adminSession && !customerSession);
  const pipelineActions = [
    {
      description: "단가표와 방문일 확정",
      label: "견적 요청",
      tone: "teal" as const,
      value: `${pipeline.quoteRequests}건`
    },
    {
      description: "품목 제안, 샘플 확인",
      label: "관심 있음",
      tone: "emerald" as const,
      value: `${pipeline.interested}건`
    },
    {
      description: "메모 후 재연락",
      label: "재관리",
      tone: "slate" as const,
      value: `${pipeline.pending + pipeline.failed}건`
    }
  ];

  return (
    <CustomerAppShell
      active="revenue"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      subtitle="방문 기록과 견적 요청을 매출 후보로 정리합니다."
      title="기회 관리"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] px-4 py-4 sm:px-4">
        <WorkspaceSectionNav
          items={[
            { active: true, badge: `${pipeline.items.length}건`, description: "예상매출과 전환율", href: "#pipeline-summary", icon: TrendingUp, label: "현황" },
            { description: "방문·원장 연결", href: "#pipeline-basis", icon: FileText, label: "기준" },
            { description: "견적·관심·보류", href: "#pipeline-status", icon: Percent, label: "상태" },
            { description: "후속 영업 대상", href: "#pipeline-table", icon: ReceiptText, label: "후보" }
          ]}
          title="기회 관리"
        />

        <div className="min-w-0 space-y-4">
        <div className="maju-section-card scroll-mt-28" id="pipeline-summary">
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
          <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
            저장 연결 또는 방문 기록 테이블을 확인하세요. 화면은 계속 사용할 수 있도록 비어 있는 상태로 표시합니다.
          </div>
        ) : null}

        <div className="grid maju-section-card lg:grid-cols-3">
          {pipelineActions.map((action) => (
            <PipelineActionCard key={action.label} {...action} />
          ))}
        </div>

        <div className="scroll-mt-28" id="pipeline-basis">
          <PipelineBasisPanel
          companyId={isAdminPreview ? companyId || "" : ""}
          conversionRate={pipeline.conversionRate}
          expectedRevenue={pipeline.expectedRevenue}
          itemCount={pipeline.items.length}
          quoteRequests={pipeline.quoteRequests}
          weightedRevenue={pipeline.weightedRevenue}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="maju-section-card scroll-mt-28" id="pipeline-status">
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

          <PipelineCandidatesTable items={pipeline.items} weightedRevenue={pipeline.weightedRevenue} />
        </div>
        </div>
      </section>
    </CustomerAppShell>
  );
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
    <div className="maju-section-card">
      {/*
        세 번째 칸을 auto로 두면 flex-wrap 버튼 묶음의 줄바꿈 전 최대 너비를 기준으로 트랙 크기가
        고정돼, 가운데 설명 문단(minmax(0,1fr))이 극단적으로 눌려 한 글자씩 줄바꿈되는 문제가
        있었습니다. minmax(0,auto)로 바꿔 필요할 때는 줄어들 수 있게 했습니다.
      */}
      <div className="grid gap-3 border-b border-slate-200/80 bg-slate-50/70 px-4 py-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,auto)] xl:items-center">
        <div>
          <p className="maju-section-title">집계 기준</p>
          <p className="mt-1 maju-muted-label normal-case tracking-normal">방문 결과 기반</p>
        </div>
        <p className="text-xs font-bold leading-5 text-slate-600">확정 매출이 아닌 실행 후보입니다. 견적 요청과 관심 거래처부터 처리합니다.</p>
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
            <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
            <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-slate-200/80 p-4 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="maju-muted-label">{label}</p>
      <p className="mt-1 truncate text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function PipelineActionCard({
  description,
  label,
  tone,
  value
}: {
  description: string;
  label: string;
  tone: "emerald" | "slate" | "teal";
  value: string;
}) {
  const toneClassName = {
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-800",
    slate: "border-slate-200 bg-slate-50/80 text-slate-800",
    teal: "border-teal-100 bg-teal-50/70 text-teal-800"
  }[tone];

  return (
    <div className={`border-b border-slate-200 p-4 lg:border-b-0 lg:border-r last:lg:border-r-0 ${toneClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase opacity-70">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <Badge className="bg-white/80 text-slate-700">다음 액션</Badge>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{description}</p>
    </div>
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
