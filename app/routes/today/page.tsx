import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { KakaoMapMarker } from "@/components/kakao-address-map";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace";
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
      hidePageTitle
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
      <section className="mx-auto max-w-[1760px]">
        <SalesRouteMapWorkspace mapMarkers={mapMarkers} routePlan={routePlan} />
      </section>
    </CustomerAppShell>
  );
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
