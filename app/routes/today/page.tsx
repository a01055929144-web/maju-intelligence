import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { createRouteMapMarkers } from "@/lib/route-map-markers";
import { getCompanyOriginAddress, getTodayRoutePlan } from "@/lib/store";

export default async function TodayRoutePage({ searchParams }: { searchParams?: { companyId?: string } }) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !searchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, searchParams?.companyId);
  const routePlan = await getTodayRoutePlan(companyId);
  const originAddress = await getCompanyOriginAddress(companyId);
  const mapMarkers = createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));

  return (
    <CustomerAppShell
      active="routes"
      companyName={customerSession?.companyName || "관리자 미리보기"}
      hidePageTitle
      mode={customerSession ? "customer" : "admin-preview"}
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
