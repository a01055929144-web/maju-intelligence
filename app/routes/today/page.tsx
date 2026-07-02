import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, Navigation, Route, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KakaoMapMarker } from "@/components/kakao-address-map";
import { RoutePlanWorkspace } from "@/components/route-plan-workspace";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getCompanyOriginAddress, getTodayRoutePlan } from "@/lib/store";

export default async function TodayRoutePage() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");

  const routePlan = await getTodayRoutePlan(customerSession?.companyId);
  const originAddress = await getCompanyOriginAddress(customerSession?.companyId);
  const mapMarkers = createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary">Route Intelligence</Badge>
            <h1 className="text-2xl font-black">오늘의 방문 계획</h1>
            <p className="mt-1 text-sm text-muted-foreground">방문 예정, 오늘 추천, 계약 가능 리드를 지역별로 묶었습니다.</p>
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
        <div className="grid gap-4 md:grid-cols-5">
          <Metric icon={CalendarCheck} label="오늘 방문" value={`${routePlan.totalStops}곳`} />
          <Metric icon={Target} label="예상 월매출" value={`${routePlan.totalExpectedRevenue.toLocaleString()}만원`} />
          <Metric icon={Navigation} label="예상 이동거리" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
          <Metric icon={Clock} label="예상 이동시간" value={formatMinutes(routePlan.totalDurationMinutes)} />
          <Metric icon={Route} label="지역 묶음" value={`${routePlan.groups.length}개`} />
        </div>

        <RoutePlanWorkspace mapMarkers={mapMarkers} routePlan={routePlan} />
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarCheck; label: string; value: string }) {
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

function formatMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function createRouteMapMarkers(originAddress: string, stops: Array<{ address?: string; name: string; order: number }>): KakaoMapMarker[] {
  const routeStops = stops
    .filter((stop) => stop.address)
    .slice(0, 10)
    .map((stop, index) => ({
      address: stop.address || "",
      label: String(stop.order || index + 1),
      name: stop.name,
      tone: "customer" as const,
      x: 24 + ((index * 13) % 58),
      y: 28 + ((index * 17) % 44)
    }));

  return [
    {
      address: originAddress,
      label: "출발",
      name: "물류 출발지",
      tone: "origin",
      x: 72,
      y: 62
    },
    ...routeStops
  ];
}
