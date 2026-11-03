import { createHash } from "crypto";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { HomeSalesDashboard, isHomeTab } from "@/components/home-sales-dashboard";
import { SalesRouteMapWorkspace } from "@/components/sales-route-map-workspace-loader";
import { buildSalesHomeSummary } from "@/application/analytics/sales-home-summary";
import { loadTodayTaskCounts } from "@/application/dashboard/today-task-counts";
import { getCompanyProfile } from "@/lib/company-profile-store";
import { companyProfileProgress } from "@/domains/organization/company-profile";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { listVehicleMaster } from "@/application/delivery/manage-vehicle-master";
import { customerHasCapability, getAdminSession, getCustomerAssignmentKeys, getCustomerSession, resolvePageCompanyId, shouldScopeCustomerData } from "@/lib/auth";
import { createCustomerLedgerMapMarkers, createRouteMapMarkers } from "@/lib/route-map-markers";
import { RequestTiming } from "@/lib/performance-timing";
import { areHoldModulesEnabled, resolveLegacyDashboardHref } from "@/lib/feature-modules";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { getChurnRiskCustomers, getCompanySettings, getCompanyStaffInvitations, getCustomerMapSummaries, getDeliveryVehicleFuelTypes, getStaffVehicleLocations, getTodayRoutePlan, listPermitLeads, listSalesContactLedger, vehicleMasterRepository } from "@/lib/store";

const CHURN_RISK_MARKER_COLOR = "#e11d48";

type OperationsSearchParams = { companyId?: string; customer?: string; detailMode?: "page"; lead?: string; leadType?: string; routeMode?: string; tab?: string; type?: string; view?: string };

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<OperationsSearchParams> }) {
  const params = (await searchParams) || {};
  if (!params?.routeMode && (params?.view || params?.leadType || params?.type)) {
    redirect(resolveLegacyDashboardHref(params || {}));
  }
  const initialView = params.routeMode === "leads"
    ? "leads"
    : params.view === "history" || params.view === "course" || params.view === "customers"
      ? params.view
      : "map";
  const timing = new RequestTiming();
  const resolvedSearchParams = params;
  const [customerSession, adminSession] = await timing.measure("auth", () => Promise.all([getCustomerSession(), getAdminSession()]));

  if (!customerSession && !adminSession) {
    timing.log("/dashboard", "redirect");
    redirect("/dashboard/login");
  }
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) {
    timing.log("/dashboard", "redirect");
    redirect("/admin/companies");
  }

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  if (!companyId) redirect("/admin/companies");
  if (customerSession?.workspaceRole === "driver") redirect("/mobile/today");
  const showHoldModules = areHoldModulesEnabled(companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const isScopedStaffView = shouldScopeCustomerData(customerSession);
  const canManageStaff = Boolean(customerSession && customerHasCapability(customerSession, "manage_members"));
  const assignmentKeys = getCustomerAssignmentKeys(customerSession);

  if (!params?.routeMode) {
    const identity = customerSession?.userId || customerSession?.companyMemberId || customerSession?.email || adminSession?.email || "dashboard";
    const actor = createHash("sha256").update(`${companyId}:${customerSession ? "customer" : "admin"}:${identity}`).digest("hex");
    const manager = !customerSession || canManagePriceSheets(customerSession);
    const includeDocuments = priceSheetsEnabled() && isFeatureEnabled("PRICING", companyId);
    const includeLinks = includeDocuments && storeOrderingEnabled() && isFeatureEnabled("STORE_ORDERING", companyId);
    const [homeCompany, leadResult, ledger, homeRoutePlan, todayTasks, homeProfile] = await timing.measure("db_home_parallel_total", () => Promise.all([
      getCompanySettings(companyId, customerSession?.companyName || "선택 고객사"),
      listPermitLeads(companyId, { excludeExcluded: true, limit: 3000 }),
      listSalesContactLedger(companyId, 5000),
      getTodayRoutePlan(companyId, { assignmentKeys }),
      loadTodayTaskCounts({ actor, companyId, includeDocuments, includeLinks, manager }),
      getCompanyProfile(companyId).catch(() => null)
    ]));
    const summary = buildSalesHomeSummary(leadResult.leads, ledger);
    timing.log("/dashboard");
    return (
      <CustomerAppShell
        active="dashboard"
        companyName={customerSession?.companyName || homeCompany.name}
        mode={customerSession ? "customer" : "admin-preview"}
        previewCompanyId={customerSession ? undefined : companyId}
        showHoldModules={showHoldModules}
        subtitle="신규 리드, 후속 연락, 방문과 배송 운영을 오늘 기준으로 정리합니다"
        title="홈"
        userName={customerSession?.name || adminSession?.email || "관리자"}
        workspaceRole={customerSession?.workspaceRole}
      >
        <HomeSalesDashboard
          companyQuery={customerSession ? "" : `&companyId=${encodeURIComponent(companyId)}`}
          delivery={{ groups: homeRoutePlan.groups.length, stops: homeRoutePlan.totalStops }}
          profileProgress={homeProfile?.available ? companyProfileProgress(homeProfile.values) : undefined}
          tab={isHomeTab(params.tab) ? params.tab : "today"}
          summary={summary}
          taskAccess={manager ? "manager" : customerSession?.workspaceRole === "sales" ? "sales" : "limited"}
          todayTasks={todayTasks}
        />
      </CustomerAppShell>
    );
  }

  const [company, routePlan, customerMaster, churnRiskCustomers, vehicleFuelTypes, staffVehicleLocations, staffInvitationResult, vehicleMasterResult] = await timing.measure("db_parallel_total", () => Promise.all([
    timing.measure("db_company", () => getCompanySettings(companyId, customerSession?.companyName || "선택 고객사")),
    timing.measure("db_route_plan", () => getTodayRoutePlan(companyId, { assignmentKeys })),
    timing.measure("db_map_customers", () => getCustomerMapSummaries(companyId, { assignmentKeys })),
    timing.measure("db_churn_risk", () => getChurnRiskCustomers(companyId).catch(() => [])),
    timing.measure("db_vehicle_fuel", () => getDeliveryVehicleFuelTypes(companyId).catch(() => ({}))),
    isScopedStaffView && !customerSession?.userId
      ? Promise.resolve([])
      : timing.measure("db_staff_locations", () => getStaffVehicleLocations(companyId, { userId: isScopedStaffView ? customerSession?.userId : undefined }).catch(() => [])),
    canManageStaff && companyId ? timing.measure("db_staff_invitations", () => getCompanyStaffInvitations(companyId).catch(() => ({ invitations: [], persisted: false }))) : Promise.resolve({ invitations: [], persisted: false }),
    companyId ? timing.measure("db_vehicle_master", () => listVehicleMaster(vehicleMasterRepository, companyId).catch(() => ({ available: false, vehicles: [] }))) : Promise.resolve({ available: false, vehicles: [] })
  ]));
  const hasOperationalCustomerMaster = customerMaster.source === "supabase";
  // getCompanyOriginAddress()는 내부에서 getCompanySettings()를 다시 호출합니다. 지도 첫 요청에서
  // 같은 회사 행을 두 번 조회하지 않고, 위에서 이미 받은 설정의 정규화된 출발지 주소를 재사용합니다.
  const originAddress = company.originAddress;
  // 2026-08-31 피드백 대응: 회원가입 단계는 물류 출발지 주소를 받지 않아, 고객사가 회사 설정에서
  // 직접 채우기 전까지는 모든 배송/영업 거리 계산이 조용히 기본값(마주식자재 창고 주소)으로
  // 이뤄집니다. 고객사 화면에서는 이를 알아챌 방법이 없었으므로 배너로 알립니다.
  const showOriginAddressBanner = Boolean(customerSession) && !company.originAddress?.trim();
  const visibleCustomerIds = new Set(customerMaster.customers.map((customer) => customer.id));
  const visibleChurnRiskCustomers = isScopedStaffView
    ? churnRiskCustomers.filter((customer) => visibleCustomerIds.has(customer.customerId))
    : churnRiskCustomers;
  const churnRiskCustomerIds = new Set(visibleChurnRiskCustomers.map((customer) => customer.customerId));
  const baseMapMarkers = hasOperationalCustomerMaster
    ? createCustomerLedgerMapMarkers(originAddress, customerMaster.customers)
    : createRouteMapMarkers(originAddress, routePlan.groups.flatMap((group) => group.stops));
  const mapMarkers = baseMapMarkers.map((marker) =>
    marker.id && churnRiskCustomerIds.has(marker.id)
      ? { ...marker, markerColor: CHURN_RISK_MARKER_COLOR, name: `이탈 위험 · ${marker.name}` }
      : marker
  );
  const timelineHref = isAdminPreview && companyId ? `/crm/timeline?companyId=${encodeURIComponent(companyId)}` : "/crm/timeline";
  const companyQuery = isAdminPreview && companyId ? `&companyId=${encodeURIComponent(companyId)}` : "";
  // 지도에서 리드 목록으로 돌아가는 입구(리드 목록 → 지도 버튼과 짝). 0033 지시서 3절.
  const mapLeadListActions = initialView === "map" ? (
    <>
      <Link className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none" href={`/leads?type=permit${companyQuery}`}>신규 리드 목록</Link>
      <Link className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none" href={`/leads?type=keyword${companyQuery}`}>영업 리드 목록</Link>
    </>
  ) : undefined;
  timing.log("/dashboard");

  return (
    <CustomerAppShell
      active="dashboard"
      companyName={customerSession?.companyName || company.name}
      fullBleed
      // 11/4: 신규·영업 리드는 다른 화면과 같은 머리(배지+제목) 간격을 씁니다. 지도만 머리를 숨깁니다.
      hidePageTitle={initialView === "map"}
      mode={customerSession ? "customer" : "admin-preview"}
      previewCompanyId={customerSession ? undefined : companyId}
      rightAction={mapLeadListActions}
      showHoldModules={showHoldModules}
      subtitle="거래처 위치, 배송차 배정, 경유 코스 계산을 지도에서 바로 처리합니다"
      title={initialView === "leads" ? "리드" : "지도 홈"}
      userName={customerSession?.name || adminSession?.email || "관리자"}
      workspaceRole={customerSession?.workspaceRole}
    >
      <section className="mx-auto flex w-full max-w-[1760px] flex-col xl:h-full xl:min-h-0">
        <SalesRouteMapWorkspace
          churnRiskCompanyId={isAdminPreview ? companyId : undefined}
          churnRiskCustomers={visibleChurnRiskCustomers}
          companyName={customerSession?.companyName || company.name}
          holdModulesEnabled={showHoldModules}
          initialView={initialView}
          initialLeadId={params.lead}
          initialLeadType={params.type === "keyword" ? "sales" : "new"}
          initialCustomerId={params.customer}
          leadDetailMode={params.detailMode === "page" ? "page" : "drawer"}
          canManageStaff={canManageStaff}
          mapMarkers={mapMarkers}
          routePlan={routePlan}
          showOriginAddressBanner={showOriginAddressBanner}
          staffVehicleLocations={staffVehicleLocations}
          staffInvitations={staffInvitationResult.invitations}
          timelineHref={timelineHref}
          vehicleFuelTypes={vehicleFuelTypes}
          vehicleMasterAvailable={vehicleMasterResult.available}
          vehicleMasterVehicles={vehicleMasterResult.vehicles}
        />
      </section>
    </CustomerAppShell>
  );
}
