import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  HeartPulse,
  Lightbulb,
  MessageSquareText,
  Route,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload
} from "lucide-react";
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
  const primaryLead = topLeads[0];
  const scoreRows = [
    ["영업력", report.health.salesPower],
    ["배송효율", report.health.deliveryEfficiency],
    ["CRM관리", report.health.crmManagement],
    ["신규영업", report.health.newSales],
    ["집중도", report.health.concentration],
    ["리스크", report.health.risk]
  ];
  const quickActions = [
    { href: "/routes/today", label: "오늘 방문 계획", icon: Route, description: "추천 리드를 지역별로 묶어 방문 순서를 봅니다." },
    { href: "/revenue/pipeline", label: "매출 파이프라인", icon: TrendingUp, description: "방문 결과가 예상 매출로 얼마나 전환되는지 봅니다." },
    { href: "/assistant", label: "AI 영업 도우미", icon: Sparkles, description: "방문 요약, 후속 메시지, 견적 메모 초안을 만듭니다." },
    { href: "/dashboard/settings", label: "회사 설정", icon: Settings, description: "회사명과 물류 출발지 주소를 수정합니다." }
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-black text-white">M</span>
              <div>
                <p className="text-sm font-black">{session.companyName}</p>
                <p className="text-xs text-muted-foreground">MAJU Intelligence</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Link
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold transition hover:bg-muted"
              href="/dashboard/settings"
            >
              <Settings className="h-4 w-4" />
              설정
            </Link>
            <CustomerLogoutButton />
          </div>
        </div>
      </header>

      <section className="border-b border-border bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px] lg:items-stretch">
          <div className="min-w-0">
            <Badge className="mb-4 bg-primary/10 text-primary">오늘의 AI 브리핑</Badge>
            <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
              안녕하세요 {session.name}님.
              <span className="block text-primary">오늘은 {briefing.missingRegions[0]}부터 확인하세요.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              현재 {briefing.currentCustomers.toLocaleString()}개 거래처를 기준으로 이번주 신규 기회 {briefing.weeklyOpportunities.toLocaleString()}곳,
              오늘 추천 {briefing.todayRecommendations}곳을 추렸습니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90"
                href="/routes/today"
              >
                오늘 영업 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold transition hover:bg-muted"
                href="/"
              >
                <Upload className="h-4 w-4" />
                거래처/매출 등록
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-bold transition hover:bg-muted"
                href="/crm/timeline"
              >
                <MessageSquareText className="h-4 w-4" />
                방문 이력
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-5">
            <p className="text-xs font-bold text-muted-foreground">Company Health Score</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-7xl font-black text-primary">{report.health.total}</span>
              <span className="pb-3 text-sm font-bold text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              영업력 {report.health.salesPower}, 배송효율 {report.health.deliveryEfficiency}, 신규영업 {report.health.newSales} 기준의 종합 건강도입니다.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={Building2} label="현재 거래처" value={`${briefing.currentCustomers}개`} />
          <Metric icon={Target} label="이번주 기회" value={`${briefing.weeklyOpportunities}곳`} />
          <Metric icon={ClipboardList} label="오늘 추천" value={`${briefing.todayRecommendations}곳`} />
          <Metric icon={Lightbulb} label="고확률 리드" value={`${briefing.highProbability}곳`} />
          <Metric icon={Route} label="동선 내 리드" value={`${briefing.routeLeads}곳`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-5 w-5 text-primary" />
                건강도 세부 점수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
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
                AI가 보는 오늘의 우선순위
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {report.aiInsights.map((insight, index) => (
                <div key={insight} className="rounded-md border border-border bg-muted/35 p-4 text-sm leading-6">
                  <Badge className="mb-3 bg-white text-foreground">제안 {index + 1}</Badge>
                  {insight}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>공략 지역</CardTitle>
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
              <div className="flex items-center justify-between gap-3">
                <CardTitle>추천 리드 TOP6</CardTitle>
                {primaryLead ? <Badge className="bg-accent/20 text-foreground">1순위 {primaryLead.region}</Badge> : null}
              </div>
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.href} className="group rounded-lg border border-border bg-white p-5 shadow-none transition hover:border-primary/40 hover:shadow-panel" href={action.href}>
              <action.icon className="mb-4 h-5 w-5 text-primary" />
              <p className="font-black">{action.label}</p>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{action.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary">
                열기
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
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
