import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Building2, ClipboardList, FileSpreadsheet, HeartPulse, Lightbulb, MessageSquareText, Route, Sparkles, Target, TrendingUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { getCustomerSession } from "@/lib/auth";
import { getCompanyDashboardPayload } from "@/lib/store";
import { CustomerLogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const session = getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const { briefing, report, leads: leadPayload, uploadHistory } = await getCompanyDashboardPayload(session.companyId);
  const topLeads = leadPayload.leads.slice(0, 6);
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
            <Badge className="mb-2 bg-primary/10 text-primary">Company Dashboard</Badge>
            <h1 className="text-2xl font-black">{session.companyName} AI 영업 대시보드</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.name} · {session.role} · {session.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/routes/today"
            >
              <Route className="h-4 w-4" />
              방문 계획
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/crm/timeline"
            >
              <MessageSquareText className="h-4 w-4" />
              방문 이력
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/revenue/pipeline"
            >
              <TrendingUp className="h-4 w-4" />
              매출 파이프라인
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/assistant"
            >
              <Sparkles className="h-4 w-4" />
              AI Assistant
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-semibold transition hover:bg-muted"
              href="/"
            >
              <Upload className="h-4 w-4" />
              엑셀 업로드
            </Link>
            <CustomerLogoutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-4 md:grid-cols-5">
          <Metric icon={Building2} label="현재 거래처" value={`${briefing.currentCustomers}개`} />
          <Metric icon={Target} label="이번주 기회" value={`${briefing.weeklyOpportunities}곳`} />
          <Metric icon={ClipboardList} label="오늘 추천" value={`${briefing.todayRecommendations}곳`} />
          <Metric icon={Lightbulb} label="고확률 리드" value={`${briefing.highProbability}곳`} />
          <Metric icon={Route} label="동선 내 리드" value={`${briefing.routeLeads}곳`} />
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
                오늘의 AI 제안
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

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>이번주 놓치고 있는 지역</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {briefing.missingRegions.map((region, index) => (
                <div key={region} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="font-black">
                    {index + 1}. {region}
                  </span>
                  <Badge>우선 공략</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>추천 리드 TOP6</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topLeads.map((lead, index) => (
                <div key={lead.id || lead.name} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[44px_1fr_90px_130px] sm:items-center">
                  <span className="text-lg font-black text-primary">{index + 1}</span>
                  <div>
                    <p className="font-bold">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.region} · 예상 월 {lead.expectedRevenue}만원
                    </p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{lead.score}점</Badge>
                  <LeadStatusSelect leadId={lead.id} value={lead.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              최근 업로드 이력
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadHistory.map((item) => (
              <div key={item.id} className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[1fr_90px_90px_100px_110px] md:items-center">
                <div>
                  <p className="font-black">{item.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.createdAt} · {item.rows.toLocaleString()} rows · 중복 {item.duplicateCount}건
                  </p>
                </div>
                <Badge className="justify-center bg-primary/10 text-primary">{item.status}</Badge>
                <div>
                  <p className="mb-1 text-xs font-bold text-muted-foreground">품질 {item.qualityScore}%</p>
                  <Progress value={item.qualityScore} />
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-muted-foreground">건강도</p>
                  <p className="text-2xl font-black text-primary">{item.healthScore}</p>
                </div>
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold transition hover:bg-muted"
                  href={`/reports/${item.reportId || "latest"}`}
                >
                  리포트 보기
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
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
