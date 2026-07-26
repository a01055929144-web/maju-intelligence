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
  const dashboardCount = dashboard.briefing.currentCustomers;
  const routeStops = routePlan.groups.flatMap((group) => group.stops);
  const routeCount = routePlan.totalStops;
  const mappableRouteCount = routeStops.filter((stop) => Boolean(stop.address?.trim())).length;
  const missingAddressCount = routeCount - mappableRouteCount;
  const routeWithoutMasterCount = Math.max(routeCount - masterCount, 0);
  const masterWithoutRouteCount = Math.max(masterCount - routeCount, 0);
  const visitCount = timeline.length;

  const checks: ConsistencyCheck[] = [
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
      detail: "지도는 주소가 있는 매장만 표시할 수 있습니다.",
      label: "코스 ↔ 지도 표시 가능",
      ok: missingAddressCount === 0,
      value: `${mappableRouteCount.toLocaleString()} / ${routeCount.toLocaleString()}곳`
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
    masterCount,
    masterWithoutRouteCount,
    missingAddressCount,
    routeWithoutMasterCount,
    visitCount
  });
  const ok = checks.every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      checkedAt: new Date().toISOString(),
      companyId: scope.companyId,
      latencyMs: Date.now() - startedAt,
      recommendations,
      source: customerMaster.source,
      summary: {
        dashboardCustomers: dashboardCount,
        historyItems: visitCount,
        masterCustomers: masterCount,
        mappableRouteStops: mappableRouteCount,
        missingAddressCustomers: missingAddressCount,
        routeStops: routeCount
      },
      checks
    },
    { status: ok ? 200 : 207 }
  );
}

function buildRecommendations({
  dashboardCount,
  masterCount,
  masterWithoutRouteCount,
  missingAddressCount,
  routeWithoutMasterCount,
  visitCount
}: {
  dashboardCount: number;
  masterCount: number;
  masterWithoutRouteCount: number;
  missingAddressCount: number;
  routeWithoutMasterCount: number;
  visitCount: number;
}) {
  const items: string[] = [];

  if (dashboardCount !== masterCount) {
    items.push("대시보드 수치와 거래처 원장 수가 다릅니다. 최신 거래처 마스터 업로드 또는 DB 저장 상태를 확인하세요.");
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
  if (visitCount === 0) {
    items.push("방문/메모 히스토리가 없습니다. 현장 방문 기록 또는 배송완료 증빙을 먼저 쌓아야 합니다.");
  }

  return items.length ? items : ["대시보드, 거래처 원장, 코스, 지도 표시 기준이 일치합니다."];
}
