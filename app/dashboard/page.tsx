import { redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace-loader";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { createCustomerLedgerMapMarkers, createRouteMapMarkers } from "@/lib/route-map-markers";
import { getChurnRiskCustomers, getCompanyOriginAddress, getCompanySettings, getCustomerMaster, getDeliveryVehicleFuelTypes, getTodayRoutePlan } from "@/lib/store";

const CHURN_RISK_MARKER_COLOR = "#e11d48";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const [company, routePlan, customerMaster, originAddress, churnRiskCustomers, vehicleFuelTypes] = await Promise.all([
    getCompanySettings(companyId, customerSession?.companyName || "선택 고객사"),
    getTodayRoutePlan(companyId),
    getCustomerMaster(companyId),
    getCompanyOriginAddress(companyId),
    getChurnRiskCustomers(companyId).catch(() => []),
    getDeliveryVehicleFuelTypes(companyId).catch(() => ({}))
  ]);
  const hasOperationalCustomerMaster = customerMaster.source === "supabase";
  // 2026-08-31 피드백 대응: 회원가입 단계는 물류 출발지 주소를 받지 않아, 고객사가 회사 설정에서
  // 직접 채우기 전까지는 모든 배송/영업 거리 계산이 조용히 기본값(마주식자재 창고 주소)으로
  // 이뤄집니다. 고객사 화면에서는 이를 알아챌 방법이 없었으므로 배너로 알립니다.
  const showOriginAddressBanner = Boolean(customerSession) && !company.originAddress?.trim();
  const churnRiskCustomerIds = new Set(churnRiskCustomers.map((customer) => customer.customerId));
  const baseMapMarkers = hasOperationalCustomerMaster
    ? createCustomerLedgerMapMarkers(originAddress, customerMaster.customers)
    : createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));
  const mapMarkers = baseMapMarkers.map((marker) =>
    marker.id && churnRiskCustomerIds.has(marker.id)
      ? { ...marker, markerColor: CHURN_RISK_MARKER_COLOR, name: `이탈 위험 · ${marker.name}` }
      : marker
  );
  const timelineHref = isAdminPreview && companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline";

  return (
    <CustomerAppShell
      active="dashboard"
      companyName={customerSession?.companyName || company.name}
      fullBleed
      hidePageTitle
      mode={customerSession ? "customer" : "admin-preview"}
      previewCompanyId={customerSession ? undefined : companyId}
      subtitle="거래처 위치, 배송차 배정, 경유 코스 계산을 지도에서 바로 처리합니다"
      title="지도 홈"
      userName={customerSession?.name || adminSession?.email || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto flex w-full max-w-[1760px] flex-col xl:h-full xl:min-h-0">
        <SalesRouteMapWorkspace
          churnRiskCompanyId={isAdminPreview ? companyId : undefined}
          churnRiskCustomers={churnRiskCustomers}
          companyName={customerSession?.companyName || company.name}
          mapMarkers={mapMarkers}
          routePlan={routePlan}
          showOriginAddressBanner={showOriginAddressBanner}
          timelineHref={timelineHref}
          vehicleFuelTypes={vehicleFuelTypes}
        />
      </section>
    </CustomerAppShell>
  );
}
