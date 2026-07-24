import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CircleDollarSign, Percent, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { Progress } from "@/components/ui/progress";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getRevenuePipeline } from "@/lib/store";

const resultLabels: Record<string, string> = {
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

export default async function RevenuePipelinePage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const pipeline = await getRevenuePipeline(companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const pipelineActions = [
    {
      description: "견적 요청 건은 단가표와 방문 일정을 바로 확정해야 합니다.",
      label: "견적 요청",
      tone: "blue" as const,
      value: `${pipeline.quoteRequests}건`
    },
    {
      description: "관심 거래처는 품목 제안과 샘플 납품 가능 여부를 확인합니다.",
      label: "관심 있음",
      tone: "emerald" as const,
      value: `${pipeline.interested}건`
    },
    {
      description: "보류·실패 건은 메모를 남기고 다음 연락 시점을 분리 관리합니다.",
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
      rightAction={
        <Link className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800" href={customerSession ? "/dashboard" : "/admin/companies"}>
          돌아가기
        </Link>
      }
      subtitle="방문 결과를 기반으로 이번 달 열려 있는 추가매출을 추정합니다."
      title="예상 매출 파이프라인"
      userName={customerSession?.name || "관리자"}
    >
      <section className="mx-auto max-w-[1560px] space-y-5 px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <p className="text-sm font-black text-slate-950">매출 파이프라인 현황</p>
              <p className="mt-1 text-xs font-bold text-slate-500">방문 결과와 견적 요청을 기준으로 열려 있는 추가매출을 집계합니다.</p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">{pipeline.items.length.toLocaleString()}건 관리 중</Badge>
          </div>
          <div className="grid md:grid-cols-4">
            <Metric icon={Banknote} label="예상 총매출" value={`${pipeline.expectedRevenue.toLocaleString()}만원`} />
            <Metric icon={CircleDollarSign} label="가중 매출" value={`${pipeline.weightedRevenue.toLocaleString()}만원`} />
            <Metric icon={TrendingUp} label="견적 요청" value={`${pipeline.quoteRequests}건`} />
            <Metric icon={Percent} label="전환 기대율" value={`${pipeline.conversionRate}%`} />
          </div>
        </div>

        <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-3">
          {pipelineActions.map((action) => (
            <PipelineActionCard key={action.label} {...action} />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-black text-slate-950">파이프라인 상태</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">결과 단계별 건수를 확인합니다.</p>
            </div>
            <div className="space-y-4 p-5">
              <PipelineLine label="견적 요청" value={pipeline.quoteRequests} total={pipeline.items.length} />
              <PipelineLine label="관심 있음" value={pipeline.interested} total={pipeline.items.length} />
              <PipelineLine label="보류" value={pipeline.pending} total={pipeline.items.length} />
              <PipelineLine label="실패" value={pipeline.failed} total={pipeline.items.length} />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">매출 후보</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">확률과 가중 매출 기준으로 우선순위를 정합니다.</p>
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
                        아직 관리 중인 매출 후보가 없습니다. 거래처 방문 기록과 견적 요청을 등록하면 이곳에 표시됩니다.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
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
