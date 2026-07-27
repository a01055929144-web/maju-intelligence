import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getCompanyDashboardPayload, getCustomerMaster, getTodayRoutePlan, getVisitTimeline } from "@/lib/store";

export const dynamic = "force-dynamic";

type ConsistencyCheck = {
  detail: string;
  label: string;
  ok: boolean;
  value: string;
};

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json(
      {
        message: scope.role === "admin" && scope.reason === "missing_company_id" ? "관리자 진단은 companyId 쿼리가 필요합니다." : "Unauthorized"
      },
      { status: scope.role === "admin" && scope.reason === "missing_company_id" ? 400 : 401 }
    );
  }

  const startedAt = Date.now();
  const [dashboard, customerMaster, routePlan, timeline] = await Promise.all([
    getCompanyDashboardPayload(scope.companyId),
    getCustomerMaster(scope.companyId),
    getTodayRoutePlan(scope.companyId),
    getVisitTimeline(scope.companyId)
  ]);

  const masterCount = customerMaster.customers.length;
  const isSupabaseSource = customerMaster.source === "supabase";
  const dashboardCount = dashboard.briefing.currentCustomers;
  const routeStops = routePlan.groups.flatMap((group) => group.stops);
  const routeCount = routePlan.totalStops;
  const routeProviderCounts = routeStops.reduce(
    (counts, stop) => {
      const provider = stop.routeProvider || "unknown";
      counts[provider] = (counts[provider] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );
  const mappableMasterCount = customerMaster.customers.filter((customer) => Boolean(customer.address?.trim())).length;
  const missingAddressCustomers = customerMaster.customers
    .filter((customer) => !customer.address?.trim())
    .slice(0, 8)
    .map((customer) => ({
      customerId: customer.id,
      customerName: customer.customerName,
      deliveryManager: customer.deliveryManager,
      deliveryZone: customer.deliveryZone || customer.region || "미분류"
    }));
  const missingAddressCount = customerMaster.customers.filter((customer) => !customer.address?.trim()).length;
  const mappableRouteCount = Math.min(routeCount, mappableMasterCount);
  const routeWithoutMasterCount = Math.max(routeCount - masterCount, 0);
  const masterWithoutRouteCount = Math.max(masterCount - routeCount, 0);
  const visitCount = timeline.length;
  const cachedRouteCount = Number(routeProviderCounts.cached || 0);
  const estimatedRouteCount = Number(routeProviderCounts.estimated || 0) + Number(routeProviderCounts.sample || 0) + Number(routeProviderCounts.unknown || 0);

  const checks: ConsistencyCheck[] = [
    {
      detail: isSupabaseSource
        ? "Supabase 거래처 원장을 기준으로 대시보드, 히스토리, 코스를 계산합니다."
        : "샘플 또는 대체 데이터 기준입니다. 운영 데이터 등록과 Supabase 연결 상태를 확인하세요.",
      label: "데이터 저장소",
      ok: isSupabaseSource,
      value: isSupabaseSource ? "Supabase 실데이터" : "샘플/대체 데이터"
    },
    {
      detail: "대시보드의 전체 거래처 수와 거래처 원장 수가 같은 기준인지 확인합니다.",
      label: "대시보드 ↔ 거래처 원장",
      ok: dashboardCount === masterCount,
      value: `${dashboardCount.toLocaleString()} / ${masterCount.toLocaleString()}곳`
    },
    {
      detail: "영업·배송 코스가 거래처 원장 기준으로 생성되는지 확인합니다.",
      label: "거래처 원장 ↔ 코스",
      ok: masterCount === routeCount,
      value: `${masterCount.toLocaleString()} / ${routeCount.toLocaleString()}곳`
    },
    {
      detail: "지도는 주소가 있는 매장만 표시할 수 있습니다. 주소가 있으면 내부 지도와 코스 화면의 마커 기준값이 됩니다.",
      label: "원장 주소 ↔ 지도 표시 가능",
      ok: missingAddressCount === 0,
      value: `${mappableRouteCount.toLocaleString()} / ${masterCount.toLocaleString()}곳`
    },
    {
      detail: "경로 계산은 티맵 캐시가 있으면 실제 도로값, 없으면 임시 추정값으로 표시됩니다.",
      label: "코스 거리 계산 기준",
      ok: Number(routeProviderCounts.cached || 0) > 0 || routeCount === 0,
      value: `실도로 ${Number(routeProviderCounts.cached || 0).toLocaleString()} / 추정 ${Number(routeProviderCounts.estimated || 0).toLocaleString()}곳`
    },
    {
      detail: "거래처 히스토리에 방문/메모 데이터가 연결되어 있는지 확인합니다.",
      label: "히스토리 데이터",
      ok: visitCount > 0,
      value: `${visitCount.toLocaleString()}건`
    }
  ];

  const recommendations = buildRecommendations({
    dashboardCount,
    isSupabaseSource,
    masterCount,
    masterWithoutRouteCount,
    missingAddressCount,
    routeProviderCounts,
    routeWithoutMasterCount,
    visitCount
  });
  const ok = checks.every((check) => check.ok);
  const passedCheckCount = checks.filter((check) => check.ok).length;
  const consistencyScore = checks.length ? Math.round((passedCheckCount / checks.length) * 100) : 0;
  const routeCalculationCoverage = routeCount > 0 ? Math.round((cachedRouteCount / routeCount) * 100) : 100;

  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      companyId: scope.companyId,
      latencyMs: Date.now() - startedAt,
      recommendations,
      source: customerMaster.source,
      summary: {
        consistencyScore,
        dashboardCustomers: dashboardCount,
        estimatedRouteStops: estimatedRouteCount,
        historyItems: visitCount,
        masterCustomers: masterCount,
        mappableRouteStops: mappableRouteCount,
        missingAddressCustomers: missingAddressCount,
        missingAddressExamples: missingAddressCustomers,
        passedChecks: passedCheckCount,
        routeCalculationCoverage,
        routeProviderCounts,
        routeStops: routeCount,
        totalChecks: checks.length
      },
      checks
    },
    { status: ok ? 200 : 207 }
  );
}

function buildRecommendations({
  dashboardCount,
  isSupabaseSource,
  masterCount,
  masterWithoutRouteCount,
  missingAddressCount,
  routeProviderCounts,
  routeWithoutMasterCount,
  visitCount
}: {
  dashboardCount: number;
  isSupabaseSource: boolean;
  masterCount: number;
  masterWithoutRouteCount: number;
  missingAddressCount: number;
  routeProviderCounts: Record<string, number>;
  routeWithoutMasterCount: number;
  visitCount: number;
}) {
  const items: string[] = [];
  const cachedRouteCount = Number(routeProviderCounts.cached || 0);
  const estimatedRouteCount = Number(routeProviderCounts.estimated || 0) + Number(routeProviderCounts.sample || 0) + Number(routeProviderCounts.unknown || 0);

  if (!isSupabaseSource) {
    items.push("현재 샘플/대체 데이터가 섞여 있습니다. 데이터 등록에서 거래처 마스터를 저장하고 Supabase 환경변수 연결을 먼저 확인하세요.");
  }
  if (dashboardCount !== masterCount) {
    items.push("대시보드 수치와 거래처 원장 수가 다릅니다. 최신 거래처 마스터 업로드 또는 DB 저장 상태를 확인하세요.");
  }
  if (dashboardCount > 0 && masterCount > 0 && dashboardCount === masterCount) {
    items.push("거래처 수는 일치합니다. 다음은 주소, 사업자번호, 담당자, 배송권역 필수값 누락 여부를 점검하세요.");
  }
  if (masterWithoutRouteCount > 0) {
    items.push(`거래처 원장에는 있으나 코스에 반영되지 않은 매장이 ${masterWithoutRouteCount.toLocaleString()}곳 있습니다. 코스 생성 기준을 확인하세요.`);
  }
  if (routeWithoutMasterCount > 0) {
    items.push(`코스에는 있으나 원장 기준과 맞지 않는 매장이 ${routeWithoutMasterCount.toLocaleString()}곳 있습니다. 샘플/캐시 데이터가 섞였는지 확인하세요.`);
  }
  if (missingAddressCount > 0) {
    items.push(`주소가 없어 지도에 표시되지 않는 매장이 ${missingAddressCount.toLocaleString()}곳 있습니다. 거래처 히스토리에서 주소를 보완하세요.`);
  }
  if (masterCount > 0 && masterWithoutRouteCount === 0 && routeWithoutMasterCount === 0) {
    items.push("거래처 원장과 코스 매장 수는 일치합니다. 다음은 코스 거리 계산 기준을 확인하세요.");
  }
  if (estimatedRouteCount > 0) {
    items.push(`티맵 실제 도로값이 아닌 추정 거리 매장이 ${estimatedRouteCount.toLocaleString()}곳 있습니다. 영업·배송 코스에서 배송 거리 전체 계산을 실행하세요.`);
  }
  if (cachedRouteCount > 0 && estimatedRouteCount === 0) {
    items.push("코스 거리 기준이 티맵 실제 도로값으로 정리되어 있습니다. 담당자/배송차 필터별 거리합만 추가 점검하면 됩니다.");
  }
  if (visitCount === 0) {
    items.push("방문/메모 히스토리가 없습니다. 현장 방문 기록 또는 배송완료 증빙을 먼저 쌓아야 합니다.");
  }

  return items.length ? items : ["대시보드, 거래처 원장, 코스, 지도 표시 기준이 일치합니다."];
}
