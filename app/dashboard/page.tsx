import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { createCustomerLedgerMapMarkers, createRouteMapMarkers } from "@/lib/route-map-markers";
import { getCompanyOriginAddress, getCompanySettings, getCustomerMaster, getTodayRoutePlan } from "@/lib/store";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const [company, routePlan, customerMaster, originAddress] = await Promise.all([
    getCompanySettings(companyId, customerSession?.companyName || "선택 고객사"),
    getTodayRoutePlan(companyId),
    getCustomerMaster(companyId),
    getCompanyOriginAddress(companyId)
  ]);
  const hasOperationalCustomerMaster = customerMaster.source === "supabase";
  const mapMarkers = hasOperationalCustomerMaster
    ? createCustomerLedgerMapMarkers(originAddress, customerMaster.customers)
    : createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));
  const timelineHref = isAdminPreview && companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline";

  return (
    <CustomerAppShell
      active="dashboard"
      companyName={customerSession?.companyName || company.name}
      hidePageTitle
      mode={customerSession ? "customer" : "admin-preview"}
      previewCompanyId={customerSession ? undefined : companyId}
      subtitle="거래처 위치, 배송차 배정, 경유 코스 계산을 지도에서 바로 처리합니다"
      title="지도 홈"
      userName={customerSession?.name || adminSession?.email || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto max-w-[1760px]">
        <SalesRouteMapWorkspace
          churnRiskCompanyId={isAdminPreview ? companyId : undefined}
          mapMarkers={mapMarkers}
          routePlan={routePlan}
          timelineHref={timelineHref}
        />
      </section>
    </CustomerAppShell>
  );
}
