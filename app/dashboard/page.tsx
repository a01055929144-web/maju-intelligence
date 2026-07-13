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
      <section className="mx-auto max-w-[1760px] space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="min-w-0">
                <Badge className="mb-3 bg-slate-100 text-slate-700">오늘 운영 요약</Badge>
                <h1 className="text-[26px] font-black leading-tight text-slate-950">오늘 확인할 거래처와 배송 코스를 정리했습니다.</h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  거래처 {briefing.currentCustomers.toLocaleString()}개 중 오늘 추천 {briefing.todayRecommendations}곳, 동선 내 신규 리드 {briefing.routeLeads}곳을 먼저 확인하세요.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800" href="/routes/today">
                  <Route className="h-4 w-4" />
                  오늘 코스 열기
                </Link>
                <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50" href="/crm/timeline">
                  <Building2 className="h-4 w-4" />
                  거래처 관리
                </Link>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric icon={Building2} label="전체 거래처" value={`${briefing.currentCustomers}개`} />
              <Metric icon={Route} label="오늘 코스" value={`${routePlan.totalStops}곳`} />
              <Metric icon={Fuel} label="예상 주유비" value={`${estimatedFuelCost.toLocaleString()}원`} />
              <Metric icon={Target} label="이번주 기회" value={`${briefing.weeklyOpportunities}곳`} />
              <Metric icon={Lightbulb} label="고확률 리드" value={`${briefing.highProbability}곳`} />
            </div>
          </div>

          <div className="rounded-md border border-slate-200/80 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Company Health Score</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-6xl font-black text-emerald-700">{report.health.total}</span>
              <span className="pb-2 text-sm font-bold text-slate-400">/ 100</span>
            </div>
            <div className="mt-4 space-y-2">
              {scoreRows.slice(0, 4).map(([label, value]) => (
                <div key={label as string}>
                  <div className="mb-1 flex justify-between text-xs font-black text-slate-500">
                    <span>{label as string}</span>
                    <span>{value as number}</span>
                  </div>
                  <Progress value={value as number} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)_360px]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" />
                오늘 할 일
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <NextAction description="사업자 상태와 배송 적재위치를 먼저 확인합니다." href="/crm/timeline" label="1. 거래처 원장 확인" value={`${briefing.currentCustomers.toLocaleString()}개`} />
              <NextAction description="방문·배송 매장을 선택하고 티맵 경로를 계산합니다." href="/routes/today" label="2. 코스 확정" value={`${routePlan.totalStops.toLocaleString()}곳`} />
              <NextAction description="ERP 거래원장 업로드 상태와 매출 변화를 봅니다." href="/revenue/transactions" label="3. 매출 데이터 점검" value={latestUpload ? "업데이트됨" : "업로드 필요"} />
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-5 w-5 text-primary" />
                  거래처 위치와 오늘 코스
                </CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">대시보드에서는 현황만 보고, 상세 코스는 영업·배송 코스에서 조정합니다.</p>
              </div>
              <Link className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50" href="/routes/today">
                상세 열기
              </Link>
            </CardHeader>
            <CardContent>
              <KakaoAddressMap mapClassName="h-[420px]" markers={mapMarkers} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  데이터 상태
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dataReadiness.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{item.label}</p>
                      <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{item.detail}</p>
                    </div>
                    <Badge className={item.ready ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}>{item.ready ? "준비" : "필요"}</Badge>
                  </div>
                ))}
                <Link className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 text-sm font-black text-white hover:bg-slate-800" href="/">
                  <Upload className="h-4 w-4" />
                  데이터 등록
                </Link>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">공략 지역</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {briefing.missingRegions.map((region, index) => (
                  <div key={region} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-black">{index + 1}. {region}</span>
                    <Badge className="bg-blue-50 text-blue-700">우선</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">추천 리드 TOP6</CardTitle>
                {primaryLead ? <Badge className="bg-accent/20 text-foreground">1순위 {primaryLead.region}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 lg:grid-cols-2">
              {topLeads.map((lead, index) => (
                <div key={lead.id || lead.name} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[34px_1fr_88px_124px] sm:items-center">
                  <span className="text-sm font-black text-primary">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{lead.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{lead.region} · 월 {lead.expectedRevenue}만원</p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{lead.score}점</Badge>
                  <LeadStatusSelect leadId={lead.id} value={lead.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-5 w-5 text-primary" />
                배송 운영
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <SmallMetric label="운행거리" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
                <SmallMetric label="예상시간" value={formatMinutes(routePlan.totalDurationMinutes)} />
                <SmallMetric label="주간거리" value={`${Math.round(routePlan.totalDistanceKm * 5).toLocaleString()}km`} />
                <SmallMetric label="월간시간" value={formatCompactMinutes(routePlan.totalDurationMinutes * 22)} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">주유비는 1L당 1,650원, 평균 연비 7.5km/L 기준의 가정값입니다.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <Card className="border-slate-200/80 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-black uppercase text-muted-foreground">{label}</p>
        <p className="mt-2 text-[26px] font-black leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}

function NextAction({ description, href, label, value }: { description: string; href: string; label: string; value: string }) {
  return (
    <Link className="group rounded-md border border-slate-200/80 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50" href={href}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <p className="mt-2 text-[22px] font-black leading-none text-slate-950">{value}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-slate-500">{description}</p>
    </Link>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200/80 bg-slate-50/70 p-3">
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
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
