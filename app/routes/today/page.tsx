import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { createCustomerLedgerMapMarkers, createRouteMapMarkers } from "@/lib/route-map-markers";
import { getCompanyOriginAddress, getCustomerMaster, getTodayRoutePlan } from "@/lib/store";

export default async function TodayRoutePage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const [routePlan, originAddress, customerMaster] = await Promise.all([
    getTodayRoutePlan(companyId),
    getCompanyOriginAddress(companyId),
    getCustomerMaster(companyId)
  ]);
  const mapMarkers =
    customerMaster.source === "supabase"
      ? createCustomerLedgerMapMarkers(originAddress, customerMaster.customers)
      : createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));

  return (
    <CustomerAppShell
      active="routes"
      companyName={customerSession?.companyName || "관리자 미리보기"}
      hidePageTitle
      mode={customerSession ? "customer" : "admin-preview"}
      previewCompanyId={customerSession ? undefined : companyId}
      subtitle="방문 관리, 배송 차량 배정, 티맵 경유 도로 계산"
      title="오늘의 영업·배송 코스"
      userName={customerSession?.name || adminSession?.email || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1760px]">
        <SalesRouteMapWorkspace mapMarkers={mapMarkers} routePlan={routePlan} />
      </section>
    </CustomerAppShell>
  );
}
