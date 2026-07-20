import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CircleDollarSign, Percent, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Banknote} label="예상 총매출" value={`${pipeline.expectedRevenue.toLocaleString()}만원`} />
          <Metric icon={CircleDollarSign} label="가중 매출" value={`${pipeline.weightedRevenue.toLocaleString()}만원`} />
          <Metric icon={TrendingUp} label="견적 요청" value={`${pipeline.quoteRequests}건`} />
          <Metric icon={Percent} label="전환 기대율" value={`${pipeline.conversionRate}%`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {pipelineActions.map((action) => (
            <PipelineActionCard key={action.label} {...action} />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <Card>
            <CardHeader>
              <CardTitle>파이프라인 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PipelineLine label="견적 요청" value={pipeline.quoteRequests} total={pipeline.items.length} />
              <PipelineLine label="관심 있음" value={pipeline.interested} total={pipeline.items.length} />
              <PipelineLine label="보류" value={pipeline.pending} total={pipeline.items.length} />
              <PipelineLine label="실패" value={pipeline.failed} total={pipeline.items.length} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>매출 후보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pipeline.items.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_100px_120px] md:items-center">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-black">{item.leadName}</p>
                      <Badge>{item.region}</Badge>
                      <Badge className="bg-primary/10 text-primary">{resultLabels[item.result] || item.result}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.memo || "메모 없음"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">확률</p>
                    <p className="text-xl font-black">{Math.round(item.probability * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">가중 매출</p>
                    <p className="text-xl font-black text-primary">{item.weightedRevenue.toLocaleString()}만원</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <Icon className="mb-4 h-5 w-5 text-primary" />
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-black">{value}</p>
      </CardContent>
    </Card>
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
    <div className={`rounded-md border p-4 ${toneClassName}`}>
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
