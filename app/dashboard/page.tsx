import { redirect } from "next/navigation";
import { MapHomeView } from "@/components/map-home-view";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { createRouteMapMarkers } from "@/lib/route-map-markers";
import { getCompanyDashboardPayload, getCompanyOriginAddress, getCompanySettings, getCustomerMaster, getTodayRoutePlan } from "@/lib/store";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const isAdminPreview = Boolean(adminSession && !customerSession);
  const withCompanyQuery = (href: string) => {
    if (!isAdminPreview || !companyId) return href;
    if (href === "/dashboard/settings") return "/admin/companies";
    return `${href}${href.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
  };

  // These five reads are all keyed only on companyId with no dependency on each other's
  // results, so they run in parallel instead of five sequential Supabase round-trips.
  const [company, { briefing, report, leads: leadPayload, uploadHistory }, routePlan, customerMaster, originAddress] = await Promise.all([
    getCompanySettings(companyId, customerSession?.companyName || "선택 고객사"),
    getCompanyDashboardPayload(companyId),
    getTodayRoutePlan(companyId),
    getCustomerMaster(companyId),
    getCompanyOriginAddress(companyId)
  ]);
  const hasOperationalCustomerMaster = customerMaster.source === "supabase";
  const customerDataCount = hasOperationalCustomerMaster ? customerMaster.customers.length : 0;
  const hasOperationalReport = hasOperationalCustomerMaster && report.health.total > 0;
  const routeStops = routePlan.groups.flatMap((group) => group.stops);
  const displayRouteStops = hasOperationalCustomerMaster ? routeStops : [];
  const mapMarkers = createRouteMapMarkers(originAddress, displayRouteStops);
  const routeStopCount = hasOperationalCustomerMaster ? routePlan.totalStops : 0;
  const topLeads = leadPayload.leads.slice(0, 6);
  const latestUpload = uploadHistory[0];
  const placeLinkedCustomers = hasOperationalCustomerMaster
    ? customerMaster.customers.filter((customer) => customer.naverPlaceUrl || customer.kakaoPlaceUrl || customer.googleMapUrl).length
    : 0;
  const placeLinkRate = hasOperationalCustomerMaster && customerMaster.customers.length ? Math.round((placeLinkedCustomers / customerMaster.customers.length) * 100) : 0;
  const operationChecklist = [
    {
      actionHref: withCompanyQuery("/dashboard/settings"),
      actionLabel: "회사 기준값 확인",
      description: "회사명, 담당자, 물류 출발지 주소가 맞아야 지도와 티맵 계산 기준이 통일됩니다.",
      done: Boolean(company.originAddress),
      label: "회사 설정",
      value: company.originAddress ? "출발지 설정됨" : "출발지 필요"
    },
    {
      actionHref: withCompanyQuery("/"),
      actionLabel: "거래처 등록",
      description: "거래처 마스터를 저장하면 히스토리, 지도, 배송차 배정의 기준 데이터가 됩니다.",
      done: customerDataCount > 0,
      label: "거래처 기본정보",
      value: `${customerDataCount.toLocaleString()}개`
    },
    {
      actionHref: withCompanyQuery("/revenue/transactions"),
      actionLabel: "매출 원장 확인",
      description: "ERP 거래원장을 업로드하면 매출 등급, 품목 이탈, 리포트 수치가 갱신됩니다.",
      done: Boolean(latestUpload),
      label: "매출 거래내역",
      value: latestUpload ? "업데이트됨" : "업로드 필요"
    },
    {
      actionHref: withCompanyQuery("/routes/today"),
      actionLabel: "코스 확정",
      description: "배송차별 매장을 선택하고 실제 도로 경유 순서를 계산해 현장 실행 코스를 만듭니다.",
      done: routeStopCount > 0,
      label: "영업·배송 코스",
      value: `${routeStopCount.toLocaleString()}곳`
    },
    {
      actionHref: withCompanyQuery("/assistant"),
      actionLabel: "리포트 확인",
      description: "거래처와 매출 데이터가 쌓이면 Company Health Score와 실행 제안이 더 정확해집니다.",
      done: hasOperationalReport,
      label: "AI 리포트",
      value: hasOperationalReport ? `${report.health.total}점` : "등록 후"
    }
  ];
  const completedChecklistCount = operationChecklist.filter((item) => item.done).length;
  const operationalProgress = Math.round((completedChecklistCount / operationChecklist.length) * 100);

  return (
    <MapHomeView
      companyId={isAdminPreview ? companyId : undefined}
      companyName={customerSession?.companyName || company.name}
      healthScore={hasOperationalReport ? report.health.total : null}
      isAdminPreview={isAdminPreview}
      mapMarkers={mapMarkers}
      operationChecklist={operationChecklist}
      operationalProgress={operationalProgress}
      originAddress={originAddress}
      placeLinkRate={placeLinkRate}
      quickNav={{
        assistantHref: withCompanyQuery("/assistant"),
        backHref: "/admin/companies",
        dataManagementHref: withCompanyQuery("/customers/data"),
        dataRegistrationHref: withCompanyQuery("/"),
        pipelineHref: withCompanyQuery("/revenue/pipeline"),
        reportHref: withCompanyQuery("/reports/latest"),
        routeHref: withCompanyQuery("/routes/today"),
        settingsHref: withCompanyQuery("/dashboard/settings"),
        settingsLabel: isAdminPreview ? "고객사 관리" : "출발지 설정",
        timelineHref: withCompanyQuery("/crm/timeline"),
        transactionsHref: withCompanyQuery("/revenue/transactions")
      }}
      routeStopCount={routeStopCount}
      stats={{
        customerCount: customerDataCount,
        latestUploadReady: Boolean(latestUpload),
        weeklyOpportunities: briefing.weeklyOpportunities
      }}
      topLeads={topLeads}
      userName={customerSession?.name || adminSession?.email || "관리자"}
    />
  );
}
