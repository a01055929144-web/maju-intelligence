import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardList, HeartPulse, MapPin, Route, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { Progress } from "@/components/ui/progress";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getLatestReport, getReportById } from "@/lib/store";

export default async function ReportDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    redirect("/dashboard/login");
  }
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const report = params.id === "latest" ? await getLatestReport(companyId) : await getReportById(params.id, companyId);
  if (!report) notFound();

  const scoreRows = [
    ["영업력", report.health.salesPower],
    ["배송효율", report.health.deliveryEfficiency],
    ["CRM관리", report.health.crmManagement],
    ["신규영업", report.health.newSales],
    ["집중도", report.health.concentration],
    ["리스크", report.health.risk]
  ];
  const topRegion = report.regionDistribution[0];
  const topWhitespace = [...report.regionDistribution].sort((a, b) => b.whitespace - a.whitespace)[0];
  const topIndustry = report.industryDistribution[0];
  const reportGrade = report.health.total >= 85 ? "확장 가능" : report.health.total >= 70 ? "운영 보완" : "집중 개선";
  const reportSummary = [
    {
      label: "핵심 거래권",
      title: topRegion ? `${topRegion.region} ${topRegion.count}개 거래처` : "거래권 확인 필요",
      body: topRegion ? `${topRegion.region} 비중이 가장 높습니다. 기존 강점 지역의 밀도를 유지하면서 인접 지역으로 확장하세요.` : "거래처 마스터 업로드 후 핵심 거래권을 확인할 수 있습니다."
    },
    {
      label: "확장 여지",
      title: topWhitespace ? `${topWhitespace.region} White Space ${topWhitespace.whitespace}곳` : "White Space 확인 필요",
      body: topWhitespace ? `${topWhitespace.region}는 현재 거래처 대비 잠재 매장이 많습니다. 이번 주 영업 후보에 우선 반영하세요.` : "지역별 시장 잠재값과 거래처 분포가 필요합니다."
    },
    {
      label: "업종 전략",
      title: topIndustry ? `${topIndustry.industry} ${topIndustry.share}%` : "업종 데이터 확인 필요",
      body: topIndustry ? `${topIndustry.industry} 업종의 전문성이 보입니다. 주력 업종은 확장하고 낮은 비중 업종은 테스트 리드로 분리하세요.` : "업종 컬럼을 등록하면 전문 업종과 제외 업종을 나눌 수 있습니다."
    }
  ];
  const actionPlan = [
    ["오늘", "A/B등급 거래처의 사업자 상태, 배송주소, 적재위치 자료를 먼저 정리합니다."],
    ["이번 주", `${report.missingRegions.slice(0, 3).join(", ") || "White Space"} 지역에 신규 리드 후보를 넣고 방문 코스를 계산합니다.`],
    ["이번 달", "매출 거래원장을 다시 업로드해 거래처 등급 변화와 품목 이탈 여부를 비교합니다."]
  ] as const;
  const dataConfidence = Math.min(100, Math.max(45, Math.round(report.customers * 0.8 + report.regions * 4 + (report.totalRevenue > 0 ? 20 : 0))));
  const isAdminPreview = Boolean(adminSession && !customerSession);

  return (
    <CustomerAppShell
      active="dashboard"
      companyName={customerSession?.companyName || "선택 고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={isAdminPreview ? companyId : undefined}
      rightAction={
        <Link className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800" href={customerSession ? "/dashboard" : "/admin/companies"}>
          돌아가기
        </Link>
      }
      subtitle={`거래처 ${report.customers}개 · 거래지역 ${report.regions}개 · 예상 추가매출 월 ${report.potentialRevenue.toLocaleString()}만원`}
      title={`${report.companyName} 상세 리포트`}
      userName={customerSession?.name || "관리자"}
    >
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Building2} label="거래처" value={`${report.customers}개`} />
          <Metric icon={MapPin} label="거래지역" value={`${report.regions}개`} />
          <Metric icon={Target} label="신규 기회" value={`${report.newOpportunities}곳`} />
          <Metric icon={Route} label="평균 배송거리" value={`${report.avgDeliveryKm.toFixed(1)}km`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-primary" />
                Company Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex items-end gap-3">
                <span className="text-7xl font-black text-primary">{report.health.total}</span>
                <span className="pb-3 text-sm font-bold text-muted-foreground">점</span>
              </div>
              <div className="mb-6 rounded-md border border-primary/15 bg-primary/5 p-4">
                <p className="text-sm font-black text-primary">{reportGrade}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
                  영업력, 배송효율, CRM관리, 신규영업, 거래처 집중도, 리스크를 가중 평균한 회사 건강도입니다.
                </p>
              </div>
              <div className="space-y-4">
                {scoreRows.map(([label, value]) => (
                  <div key={label as string}>
                    <div className="mb-1 flex justify-between text-sm font-bold">
                      <span>{label as string}</span>
                      <span>{value as number}</span>
                    </div>
                    <Progress value={value as number} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                운영 진단 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {reportSummary.map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-muted/35 p-4">
                  <Badge className="mb-2 bg-white text-slate-600">{item.label}</Badge>
                  <p className="text-lg font-black text-slate-950">{item.title}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                우선 실행 액션
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {actionPlan.map(([period, action]) => (
                <div key={period} className="rounded-md border border-border bg-white p-4">
                  <p className="text-sm font-black text-primary">{period}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{action}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                리포트 신뢰도
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-end gap-2">
                <span className="text-4xl font-black text-slate-950">{dataConfidence}</span>
                <span className="pb-1 text-sm font-bold text-muted-foreground">%</span>
              </div>
              <Progress value={dataConfidence} />
              <p className="mt-3 text-xs font-semibold leading-5 text-muted-foreground">
                거래처 수, 거래지역 수, 매출 데이터 존재 여부를 기준으로 산정합니다. 매출 거래원장과 사업자 자료가 늘수록 리포트 품질이 올라갑니다.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <ReportBlock title="거래처 분포" icon={MapPin}>
            {report.regionDistribution.slice(0, 6).map((item) => (
              <Line key={item.region} label={item.region} value={`${item.count}개`} hint={`잠재 ${item.potential}곳`} />
            ))}
          </ReportBlock>
          <ReportBlock title="업종 분석" icon={BarChart3}>
            {report.industryDistribution.map((item) => (
              <Line key={item.industry} label={item.industry} value={`${item.share}%`} hint={`${item.count}개`} />
            ))}
          </ReportBlock>
          <ReportBlock title="추천 리드" icon={ClipboardList}>
            {report.leadRecommendations.slice(0, 6).map((lead) => (
              <Line key={lead.name} label={lead.name} value={`${lead.score}점`} hint={lead.region} />
            ))}
          </ReportBlock>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              AI 상세 제안
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {report.aiInsights.map((insight) => (
              <div key={insight} className="rounded-md border border-border bg-muted/35 p-4 text-sm font-semibold leading-6">
                {insight}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
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

function ReportBlock({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <div>
        <p className="font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <span className="text-lg font-black">{value}</span>
    </div>
  );
}
