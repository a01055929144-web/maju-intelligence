import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, CircleDollarSign, FileText, Percent, ReceiptText, Route, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { Progress } from "@/components/ui/progress";
import { WorkspaceSectionNav } from "@/components/workspace-section-nav";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getRevenuePipeline, type RevenuePipeline } from "@/lib/store";

const resultLabels: Record<string, string> = {
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

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
      tone: "blue" as const,
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
      subtitle="방문 결과와 견적 요청을 매출 후보로 정리합니다."
      title="매출 성장"
      userName={customerSession?.name || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto grid max-w-[1560px] gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-24 xl:self-start">
          <WorkspaceSectionNav
            items={[
              { active: true, badge: `${pipeline.items.length}건`, description: "예상매출, 가중매출, 전환율을 먼저 봅니다.", href: "#pipeline-summary", icon: TrendingUp, label: "성장 현황" },
              { description: "방문 기록과 매출 원장 연결 기준을 확인합니다.", href: "#pipeline-basis", icon: FileText, label: "실행 기준" },
              { description: "견적 요청, 관심 있음, 보류 상태를 나눠 봅니다.", href: "#pipeline-status", icon: Percent, label: "상태 분포" },
              { description: "실제 후속 영업을 해야 할 후보 목록입니다.", href: "#pipeline-table", icon: ReceiptText, label: "후보 목록" }
            ]}
            title="매출 성장"
          />
        </div>

        <div className="min-w-0 space-y-4">
        <div className="maju-section-card scroll-mt-28" id="pipeline-summary">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">성장 후보 현황</p>
              <p className="mt-1 maju-muted-label">방문 메모 · 견적 요청 기준</p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">{pipeline.items.length.toLocaleString()}건 관리 중</Badge>
          </div>
          <div className="grid md:grid-cols-4">
            <Metric icon={Banknote} label="예상 총매출" value={`${pipeline.expectedRevenue.toLocaleString()}만원`} />
            <Metric icon={CircleDollarSign} label="가중 매출" value={`${pipeline.weightedRevenue.toLocaleString()}만원`} />
            <Metric icon={TrendingUp} label="견적 대기" value={`${pipeline.quoteRequests}건`} />
            <Metric icon={Percent} label="예상 전환율" value={`${pipeline.conversionRate}%`} />
          </div>
        </div>

        {pipelineError ? (
          <div className="maju-filter-box border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
            DB 연결 또는 방문 기록 테이블을 확인하세요. 화면은 계속 사용할 수 있도록 비어 있는 상태로 표시합니다.
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
            <div className="space-y-4 p-5">
              <PipelineLine label="견적 요청" value={pipeline.quoteRequests} total={pipeline.items.length} />
              <PipelineLine label="관심 있음" value={pipeline.interested} total={pipeline.items.length} />
              <PipelineLine label="보류" value={pipeline.pending} total={pipeline.items.length} />
              <PipelineLine label="실패" value={pipeline.failed} total={pipeline.items.length} />
            </div>
          </section>

          <section className="maju-section-card scroll-mt-28" id="pipeline-table">
            <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">성장 후보 목록</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">견적·관심 거래처 우선순위</p>
              </div>
              <Badge className="bg-slate-900 text-white">가중 매출 {pipeline.weightedRevenue.toLocaleString()}만원</Badge>
            </div>
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-left text-xs font-black text-slate-500">
                    <th className="border-b border-slate-200 px-4 py-3 text-center">No</th>
                    <th className="border-b border-slate-200 px-4 py-3">거래처 후보</th>
                    <th className="border-b border-slate-200 px-4 py-3">상태</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">계약 확률</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">가중 매출</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.items.map((item, index) => (
                    <tr key={item.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60 hover:bg-blue-50/60">
                      <td className="border-b border-slate-100 px-4 py-3 text-center text-xs text-slate-400">{index + 1}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <p className="font-black text-slate-950">{item.leadName}</p>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.memo || "메모 없음"}</p>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge className="bg-slate-100 text-slate-700">{item.region}</Badge>
                          <Badge className="bg-blue-100 text-blue-800">{resultLabels[item.result] || item.result}</Badge>
                        </div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black">{Math.round(item.probability * 100)}%</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black text-teal-700">{item.weightedRevenue.toLocaleString()}만원</td>
                    </tr>
                  ))}
                  {!pipeline.items.length ? (
                    <tr>
                      <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={5}>
                        아직 관리 중인 성장 후보가 없습니다. 거래처 방문 기록과 견적 요청을 등록하면 이곳에 표시됩니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
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
    { href: withCompanyQuery("/crm/timeline"), icon: FileText, label: "방문 메모 보완" },
    { href: withCompanyQuery("/revenue/transactions"), icon: ReceiptText, label: "매출 원장 확인" },
    { href: withCompanyQuery("/dashboard"), icon: Route, label: "지도 홈에서 코스 조정" }
  ];

  return (
    <div className="maju-section-card">
      <div className="grid gap-3 border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-center">
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
    <div className="border-b border-slate-200/80 p-5 md:border-b-0 md:border-r last:md:border-r-0">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="maju-muted-label">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
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
  tone: "blue" | "emerald" | "slate";
  value: string;
}) {
  const toneClassName = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-800",
    slate: "border-slate-200 bg-slate-50/80 text-slate-800"
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
