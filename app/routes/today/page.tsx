import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, Navigation, Target, Truck } from "lucide-react";
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
    <main className="min-h-screen bg-[#f5f8f7]">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <Badge className="mb-2 rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-700">Route Intelligence</Badge>
            <h1 className="text-2xl font-black text-slate-950">오늘의 영업·배송 코스</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">영업 방문과 배송 최적화를 분리해서 운영합니다.</p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            href={customerSession ? "/dashboard" : "/admin"}
          >
            돌아가기
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="grid gap-3 md:grid-cols-5">
          <Metric icon={CalendarCheck} label="영업 방문 후보" value={`${routePlan.totalStops}곳`} />
          <Metric icon={Target} label="예상 월매출" value={`${routePlan.totalExpectedRevenue.toLocaleString()}만원`} />
          <Metric icon={Navigation} label="배송 예상거리" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
          <Metric icon={Clock} label="배송 예상시간" value={formatMinutes(routePlan.totalDurationMinutes)} />
          <Metric icon={Truck} label="배송차량" value="10대" />
        </div>

        <RoutePlanWorkspace mapMarkers={mapMarkers} routePlan={routePlan} />
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarCheck; label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
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
