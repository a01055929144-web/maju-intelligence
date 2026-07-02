import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, Clock, Navigation, Target, Truck } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
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
    <CustomerAppShell
      active="routes"
      companyName={customerSession?.companyName || "관리자 미리보기"}
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
          href={customerSession ? "/dashboard" : "/admin"}
        >
          돌아가기
        </Link>
      }
      subtitle="방문 관리, 배송 차량 배정, 티맵 경유 도로 계산"
      title="오늘의 영업·배송 코스"
      userName={customerSession?.name || adminSession?.email || "관리자"}
    >
      <section className="mx-auto max-w-[1680px] space-y-4">
        <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 md:grid-cols-5">
          <Metric icon={CalendarCheck} label="영업 방문 후보" value={`${routePlan.totalStops}곳`} />
          <Metric icon={Target} label="예상 월매출" value={`${routePlan.totalExpectedRevenue.toLocaleString()}만원`} />
          <Metric icon={Navigation} label="배송 예상거리" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
          <Metric icon={Clock} label="배송 예상시간" value={formatMinutes(routePlan.totalDurationMinutes)} />
          <Metric icon={Truck} label="배송차량" value="10대" />
        </div>

        <RoutePlanWorkspace mapMarkers={mapMarkers} routePlan={routePlan} />
      </section>
    </CustomerAppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarCheck; label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
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
