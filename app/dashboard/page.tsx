import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  Fuel,
  HeartPulse,
  Lightbulb,
  MapPin,
  MessageSquareText,
  ReceiptText,
  Route,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Truck,
  Upload
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KakaoAddressMap } from "@/components/kakao-address-map";
import { Progress } from "@/components/ui/progress";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { getCustomerSession } from "@/lib/auth";
import { getCompanyDashboardPayload, getTodayRoutePlan } from "@/lib/store";
import { CustomerLogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const session = getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const { briefing, report, leads: leadPayload, uploadHistory } = await getCompanyDashboardPayload(session.companyId);
  const routePlan = await getTodayRoutePlan(session.companyId);
  const estimatedFuelCost = estimateFuelCost(routePlan.totalDistanceKm);
  const topLeads = leadPayload.leads.slice(0, 6);
  const primaryLead = topLeads[0];
  const latestUpload = uploadHistory[0];
  const dataReadiness = [
    { label: "거래처 마스터", ready: briefing.currentCustomers > 0, detail: `${briefing.currentCustomers.toLocaleString()}개 거래처` },
    { label: "최근 업로드", ready: Boolean(latestUpload), detail: latestUpload ? latestUpload.createdAt : "업로드 필요" },
    { label: "오늘 코스", ready: routePlan.totalStops > 0, detail: `${routePlan.totalStops.toLocaleString()}곳 방문/배송` }
  ];
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
    { href: "/revenue/transactions", label: "매출 거래내역", icon: ReceiptText, description: "ERP 엑셀에서 누적된 일자·품목·금액 원장을 확인합니다." },
    { href: "/assistant", label: "AI 영업 도우미", icon: Sparkles, description: "방문 요약, 후속 메시지, 견적 메모 초안을 만듭니다." },
    { href: "/dashboard/settings", label: "회사 설정", icon: Settings, description: "회사명과 물류 출발지 주소를 수정합니다." }
  ];
  const mapMarkers = [
    { label: "출발", name: "하남 물류센터", address: "경기도 하남시 초이로 133 1층", x: 72, y: 62, tone: "origin" },
    { label: "A", name: "성수 온반", address: "서울 성동구 성수이로 88", x: 45, y: 28, tone: "customer" },
    { label: "B", name: "광진 능동 식당", address: "서울시 광진구 능동로 41길 17 1층", x: 58, y: 34, tone: "customer" },
    { label: "C", name: "송파 고깃집", address: "서울 송파구 가락로 120", x: 62, y: 50, tone: "customer" },
    { label: "D", name: "위례 신규매장", address: "경기 성남시 수정구 위례광장로 21", x: 67, y: 56, tone: "lead" },
    { label: "E", name: "망원 브런치", address: "서울 마포구 망원로 33", x: 28, y: 31, tone: "lead" }
  ] as const;

  return (
    <CustomerAppShell
      active="dashboard"
      companyName={session.companyName}
      rightAction={<CustomerLogoutButton />}
      subtitle="거래처 히스토리, 배송 동선, 신규 리드 현황"
      title="대시보드"
      userName={session.name}
    >
      <section className="mx-auto max-w-[1680px] space-y-6">
        <div className="grid gap-6 rounded-lg border border-border bg-white p-6 shadow-sm lg:grid-cols-[1fr_360px] lg:items-stretch">
          <div className="min-w-0">
            <Badge className="mb-4 bg-primary/10 text-primary">MAJU 운영 지휘판</Badge>
            <h1 className="max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
              거래처 히스토리와 배송 동선을 기준으로
              <span className="block text-primary">오늘 공략할 매장을 정리했습니다.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {session.name}님 회사의 거래처 {briefing.currentCustomers.toLocaleString()}개, 이번주 신규 기회 {briefing.weeklyOpportunities.toLocaleString()}곳,
              동선 내 리드 {briefing.routeLeads}곳을 한 화면에서 판단합니다.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-bold text-muted-foreground">거래처 기준</p>
                <p className="mt-1 font-black">사업자 정보 + 히스토리</p>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-bold text-muted-foreground">운영 기준</p>
                <p className="mt-1 font-black">출발지에서 배송주소까지</p>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-xs font-bold text-muted-foreground">성장 기준</p>
                <p className="mt-1 font-black">{briefing.missingRegions[0]} 신규 발굴</p>
              </div>
            </div>
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={Building2} label="현재 거래처" value={`${briefing.currentCustomers}개`} />
          <Metric icon={Target} label="이번주 기회" value={`${briefing.weeklyOpportunities}곳`} />
          <Metric icon={ClipboardList} label="오늘 추천" value={`${briefing.todayRecommendations}곳`} />
          <Metric icon={Lightbulb} label="고확률 리드" value={`${briefing.highProbability}곳`} />
          <Metric icon={Route} label="동선 내 리드" value={`${briefing.routeLeads}곳`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                오늘 실행 순서
              </CardTitle>
              <p className="text-sm text-muted-foreground">고객사가 로그인 후 바로 따라갈 수 있는 운영 순서입니다.</p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <NextAction
                description="전체 거래처와 사업자/배송 정보를 먼저 확인합니다."
                href="/crm/timeline"
                label="1. 거래처 확인"
                value={`${briefing.currentCustomers.toLocaleString()}개`}
              />
              <NextAction
                description="오늘 방문·배송할 매장을 선택하고 동선을 계산합니다."
                href="/routes/today"
                label="2. 오늘 코스"
                value={`${routePlan.totalStops.toLocaleString()}곳`}
              />
              <NextAction
                description="매출 원장을 확인하고 추가 업로드가 필요한지 봅니다."
                href="/revenue/transactions"
                label="3. 매출 점검"
                value={latestUpload ? "업데이트됨" : "업로드 필요"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                데이터 준비 상태
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dataReadiness.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div>
                    <p className="font-black">{item.label}</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">{item.detail}</p>
                  </div>
                  <Badge className={item.ready ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}>
                    {item.ready ? "준비됨" : "필요"}
                  </Badge>
                </div>
              ))}
              <Link
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-white text-sm font-black transition hover:bg-muted"
                href="/"
              >
                <Upload className="h-4 w-4" />
                거래처/매출 데이터 등록
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              배송 운영 대시보드
            </CardTitle>
            <p className="text-sm text-muted-foreground">배송 코스에서 계산되는 km, 주유비, 예정 시간을 기간별로 관리합니다.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={Route} label="금일 총 km" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
              <Metric icon={Fuel} label="예상 주유비" value={`${estimatedFuelCost.toLocaleString()}원`} />
              <Metric icon={Clock} label="일 배송 예정" value={formatMinutes(routePlan.totalDurationMinutes)} />
              <Metric icon={CalendarDays} label="월 배송 예정" value={formatCompactMinutes(routePlan.totalDurationMinutes * 22)} />
            </div>
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[72px_1fr_1fr_1fr_1fr] bg-muted px-3 py-2 text-xs font-black text-muted-foreground">
                <span>기간</span>
                <span className="text-right">예상 km</span>
                <span className="text-right">주유비</span>
                <span className="text-right">배송시간</span>
                <span className="text-right">방문/배송</span>
              </div>
              {[
                ["일별", 1],
                ["주별", 5],
                ["월별", 22],
                ["분기", 66],
                ["연간", 264]
              ].map(([label, multiplier]) => {
                const count = Number(multiplier);
                return (
                  <div key={String(label)} className="grid grid-cols-[72px_1fr_1fr_1fr_1fr] border-t border-border px-3 py-3 text-xs font-bold">
                    <span className="font-black">{String(label)}</span>
                    <span className="text-right">{Math.round(routePlan.totalDistanceKm * count).toLocaleString()}km</span>
                    <span className="text-right">{(estimatedFuelCost * count).toLocaleString()}원</span>
                    <span className="text-right">{formatCompactMinutes(routePlan.totalDurationMinutes * count)}</span>
                    <span className="text-right">{(routePlan.totalStops * count).toLocaleString()}곳</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">주유비는 1L당 1,650원, 평균 연비 7.5km/L 기준의 가정값입니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              거래처 주소 지도
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KakaoAddressMap markers={mapMarkers} />
          </CardContent>
        </Card>

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
              최근 데이터 등록 이력
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

function NextAction({ description, href, label, value }: { description: string; href: string; label: string; value: string }) {
  return (
    <Link className="group rounded-md border border-border bg-muted/25 p-4 transition hover:border-primary/40 hover:bg-primary/5" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">{label}</p>
          <p className="mt-2 text-2xl font-black text-primary">{value}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-muted-foreground">{description}</p>
    </Link>
  );
}

function estimateFuelCost(distanceKm: number) {
  const fuelPrice = 1650;
  const fuelEfficiencyKmPerLiter = 7.5;
  return Math.round((distanceKm / fuelEfficiencyKmPerLiter) * fuelPrice);
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function formatCompactMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatMinutes(minutes);
  const days = Math.floor(hours / 8);
  const restHours = hours % 8;
  return restHours ? `${days}일 ${restHours}시간` : `${days}일`;
}

function DashboardAddressMap({
  markers
}: {
  markers: ReadonlyArray<{ readonly address: string; readonly label: string; readonly name: string; readonly tone: "customer" | "lead" | "origin"; readonly x: number; readonly y: number }>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="relative min-h-96 overflow-hidden rounded-lg border border-border bg-white bg-[linear-gradient(90deg,rgba(15,118,110,0.10)_1px,transparent_1px),linear-gradient(180deg,rgba(15,118,110,0.10)_1px,transparent_1px)] bg-[size:42px_42px]">
        <div className="absolute left-[10%] top-[20%] h-[62%] w-[74%] rounded-[40%] border-2 border-dashed border-primary/25" />
        <div className="absolute left-[24%] top-[28%] h-[44%] w-[58%] rounded-[48%] border border-accent/60 bg-accent/10" />
        <div className="absolute left-[42%] top-[31%] h-[2px] w-[30%] rotate-[28deg] bg-primary/30" />
        <div className="absolute left-[55%] top-[44%] h-[2px] w-[20%] rotate-[42deg] bg-primary/30" />
        <div className="absolute left-[30%] top-[42%] h-[2px] w-[44%] rotate-[18deg] bg-primary/20" />
        {markers.map((marker) => (
          <div key={marker.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>
            <span
              className={
                marker.tone === "origin"
                  ? "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-foreground text-xs font-black text-white shadow-panel"
                  : marker.tone === "lead"
                    ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-accent text-xs font-black text-foreground shadow-panel"
                    : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-primary text-xs font-black text-white shadow-panel"
              }
            >
              {marker.label}
            </span>
          </div>
        ))}
        <div className="absolute bottom-3 left-3 rounded-md border border-border bg-white/95 p-3 text-xs shadow-panel">
          <p className="font-black">임의 주소 좌표</p>
          <p className="mt-1 text-muted-foreground">실제 API 연동 전 지도 UX 검증용 화면입니다.</p>
        </div>
      </div>
      <div className="space-y-3">
        {markers.map((marker) => (
          <div key={marker.name} className="rounded-md border border-border bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black">{marker.name}</p>
              <Badge className={marker.tone === "lead" ? "bg-accent/20 text-foreground" : marker.tone === "origin" ? "bg-foreground text-white" : "bg-primary/10 text-primary"}>
                {marker.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{marker.address}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
