import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, Building2, ClipboardList, HeartPulse, MapPin, Route, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getLatestReport, getReportById } from "@/lib/store";

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    redirect("/dashboard/login");
  }

  const companyId = customerSession?.companyId;
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

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">MAJU AI Report</Badge>
            <h1 className="text-2xl font-black">{report.companyName} 상세 리포트</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              거래처 {report.customers}개 · 거래지역 {report.regions}개 · 예상 추가매출 월 {report.potentialRevenue.toLocaleString()}만원
            </p>
          </div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
            href={customerSession ? "/dashboard" : "/admin"}
          >
            돌아가기
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric icon={Building2} label="거래처" value={`${report.customers}개`} />
          <Metric icon={MapPin} label="거래지역" value={`${report.regions}개`} />
          <Metric icon={Target} label="신규 기회" value={`${report.newOpportunities}곳`} />
          <Metric icon={Route} label="평균 배송거리" value={`${report.avgDeliveryKm.toFixed(1)}km`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
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
                <BarChart3 className="h-5 w-5 text-primary" />
                AI 제안
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {report.aiInsights.map((insight) => (
                <div key={insight} className="rounded-md border border-border bg-muted/35 p-4 text-sm leading-6">
                  {insight}
                </div>
              ))}
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
      </section>
    </main>
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

