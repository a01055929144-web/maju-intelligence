import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { findDuplicateCustomerCandidates, getCompanyDashboardPayload, getCustomerMaster, getSalesTransactions, getTodayRoutePlan, getVisitTimeline } from "@/lib/store";

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
  const [dashboard, customerMaster, routePlan, timeline, sales, duplicateGroups] = await Promise.all([
    getCompanyDashboardPayload(scope.companyId),
    getCustomerMaster(scope.companyId),
    getTodayRoutePlan(scope.companyId),
    getVisitTimeline(scope.companyId),
    getSalesTransactions(scope.companyId),
    findDuplicateCustomerCandidates(scope.companyId).catch(() => [])
  ]);

  const masterCount = customerMaster.customers.length;
  const isSupabaseSource = customerMaster.source === "supabase";
  const dashboardCount = isSupabaseSource ? dashboard.briefing.currentCustomers : 0;
  const routeStops = isSupabaseSource ? routePlan.groups.flatMap((group) => group.stops) : [];
  const routeCount = isSupabaseSource ? routePlan.totalStops : 0;
  const operationalMasterCount = isSupabaseSource ? masterCount : 0;
  const routeProviderCounts = routeStops.reduce(
    (counts, stop) => {
      const provider = stop.routeProvider || "unknown";
      counts[provider] = (counts[provider] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>
  );
  const mappableMasterCount = isSupabaseSource ? customerMaster.customers.filter((customer) => Boolean(customer.address?.trim())).length : 0;
  const missingAddressCustomers = isSupabaseSource
    ? customerMaster.customers
        .filter((customer) => !customer.address?.trim())
        .slice(0, 8)
        .map((customer) => ({
          customerId: customer.id,
          customerName: customer.customerName,
          deliveryManager: customer.deliveryManager,
          deliveryZone: customer.deliveryZone || customer.region || "미분류"
        }))
    : [];
  const missingAddressCount = isSupabaseSource ? customerMaster.customers.filter((customer) => !customer.address?.trim()).length : 0;
  const mappableRouteCount = Math.min(routeCount, mappableMasterCount);
  const routeWithoutMasterCount = Math.max(routeCount - operationalMasterCount, 0);
  const masterWithoutRouteCount = Math.max(operationalMasterCount - routeCount, 0);
  const businessStatusReadyCount = isSupabaseSource ? customerMaster.customers.filter((customer) => customer.businessStatus === "정상").length : 0;
  const businessStatusNeedsCheckCount = isSupabaseSource ? customerMaster.customers.filter((customer) => customer.businessStatus !== "정상").length : 0;
  const businessNumberMissingCount = isSupabaseSource ? customerMaster.customers.filter((customer) => !customer.businessNumber?.trim()).length : 0;
  const visitCount = timeline.length;
  const cachedRouteCount = Number(routeProviderCounts.cached || 0);
  const estimatedRouteCount = Number(routeProviderCounts.estimated || 0) + Number(routeProviderCounts.unknown || 0);

  const checks: ConsistencyCheck[] = [
    {
      detail: isSupabaseSource
        ? "Supabase 거래처 원장을 기준으로 대시보드, 히스토리, 코스를 계산합니다."
        : "거래처 원장이 아직 연결되지 않았습니다. 데이터 등록과 Supabase 연결 상태를 확인하세요.",
      label: "데이터 저장소",
      ok: isSupabaseSource,
      value: isSupabaseSource ? "실서버 원장" : "원장 미연결"
    },
    {
      detail: "대시보드의 전체 거래처 수와 거래처 원장 수가 같은 기준인지 확인합니다.",
      label: "대시보드 ↔ 거래처 원장",
      ok: isSupabaseSource && dashboardCount === operationalMasterCount,
      value: `${dashboardCount.toLocaleString()} / ${operationalMasterCount.toLocaleString()}곳`
    },
    {
      detail: "지도 홈의 코스가 거래처 원장 기준으로 생성되는지 확인합니다.",
      label: "거래처 원장 ↔ 코스",
      ok: isSupabaseSource && operationalMasterCount === routeCount,
      value: `${operationalMasterCount.toLocaleString()} / ${routeCount.toLocaleString()}곳`
    },
    {
      detail: "지도는 주소가 있는 매장만 표시할 수 있습니다. 주소가 있으면 내부 지도와 코스 화면의 마커 기준값이 됩니다.",
      label: "원장 주소 ↔ 지도 표시 가능",
      ok: isSupabaseSource && missingAddressCount === 0,
      value: `${mappableRouteCount.toLocaleString()} / ${operationalMasterCount.toLocaleString()}곳`
    },
    {
      detail: "경로 계산은 티맵 캐시가 있으면 실제 도로값, 없으면 도로 미계산 상태로 구분합니다.",
      label: "코스 거리 계산 기준",
      ok: Number(routeProviderCounts.cached || 0) > 0 || routeCount === 0,
      value: `실도로 ${Number(routeProviderCounts.cached || 0).toLocaleString()} / 미계산 ${Number(routeProviderCounts.estimated || 0).toLocaleString()}곳`
    },
    {
      detail: "거래처 히스토리에 방문/메모 데이터가 연결되어 있는지 확인합니다.",
      label: "히스토리 데이터",
      ok: visitCount > 0,
      value: `${visitCount.toLocaleString()}건`
    },
    {
      detail: "국세청 사업자 상태조회 결과가 거래처 원장에 반영되어 있는지 확인합니다.",
      label: "사업자 상태 기준",
      ok: isSupabaseSource && businessStatusNeedsCheckCount === 0 && businessNumberMissingCount === 0,
      value: `정상 ${businessStatusReadyCount.toLocaleString()} / 확인 ${businessStatusNeedsCheckCount.toLocaleString()}곳`
    },
    {
      detail: "매출 원장의 거래처(사업자번호 또는 상호명·주소)가 거래처 원장과 같은 키로 연결되는지 확인합니다.",
      label: "매출 원장 ↔ 거래처 매칭",
      ok: sales.transactionCount === 0 || sales.unmatchedCustomerCount === 0,
      value: sales.transactionCount ? `매칭 ${sales.matchRate}% (미매칭 ${sales.unmatchedCustomerCount.toLocaleString()}곳)` : "매출 원장 없음"
    },
    {
      detail: "같은 상호명이 주소 표기 차이 등으로 서로 다른 거래처 레코드로 쪼개져 있는지 확인합니다.",
      label: "거래처 중복 후보",
      ok: duplicateGroups.length === 0,
      value: duplicateGroups.length ? `${duplicateGroups.length.toLocaleString()}건 의심` : "중복 없음"
    },
    {
      detail: "거래처 원장은 한 번에 최대 3,000건까지 불러옵니다. 이 이상이면 거래처 원장 목록 하단의 '더 불러오기'로 나머지를 이어서 불러오세요.",
      label: "거래처 원장 전체 로드",
      ok: !customerMaster.truncated,
      value: customerMaster.truncated ? "일부만 표시됨(더 불러오기 가능)" : "전체 표시"
    },
    {
      detail: "매출 원장은 최근 거래 기준으로 한 번에 최대 1,000건까지 불러옵니다. 매출 원장 > 테이블 하단의 '더 불러오기'로 나머지를 이어서 불러오세요.",
      label: "매출 원장 전체 로드",
      ok: !sales.truncated,
      value: sales.truncated ? "일부만 표시됨(더 불러오기 가능)" : "전체 표시"
    }
  ];

  const recommendations = buildRecommendations({
    businessNumberMissingCount,
    businessStatusNeedsCheckCount,
    dashboardCount,
    duplicateGroupCount: duplicateGroups.length,
    isSupabaseSource,
    masterCount: operationalMasterCount,
    masterWithoutRouteCount,
    missingAddressCount,
    routeProviderCounts,
    routeWithoutMasterCount,
    salesMatchRate: sales.matchRate,
    salesTransactionCount: sales.transactionCount,
    salesTruncated: sales.truncated,
    salesUnmatchedCustomerCount: sales.unmatchedCustomerCount,
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
        masterCustomers: operationalMasterCount,
        mappableRouteStops: mappableRouteCount,
        businessNumberMissingCustomers: businessNumberMissingCount,
        businessStatusNeedsCheckCustomers: businessStatusNeedsCheckCount,
        businessStatusReadyCustomers: businessStatusReadyCount,
        missingAddressCustomers: missingAddressCount,
        missingAddressExamples: missingAddressCustomers,
        passedChecks: passedCheckCount,
        routeCalculationCoverage,
        routeProviderCounts,
        routeStops: routeCount,
        salesMatchRate: sales.matchRate,
        salesTransactionCount: sales.transactionCount,
        salesTruncated: sales.truncated,
        salesUnmatchedCustomerCount: sales.unmatchedCustomerCount,
        duplicateCustomerGroups: duplicateGroups.length,
        duplicateCustomerExamples: duplicateGroups.slice(0, 5),
        totalChecks: checks.length
      },
      checks
    },
    { status: ok ? 200 : 207 }
  );
}

function buildRecommendations({
  businessNumberMissingCount,
  businessStatusNeedsCheckCount,
  dashboardCount,
  duplicateGroupCount,
  isSupabaseSource,
  masterCount,
  masterWithoutRouteCount,
  missingAddressCount,
  routeProviderCounts,
  routeWithoutMasterCount,
  salesMatchRate,
  salesTransactionCount,
  salesTruncated,
  salesUnmatchedCustomerCount,
  visitCount
}: {
  businessNumberMissingCount: number;
  businessStatusNeedsCheckCount: number;
  dashboardCount: number;
  duplicateGroupCount: number;
  isSupabaseSource: boolean;
  masterCount: number;
  masterWithoutRouteCount: number;
  missingAddressCount: number;
  routeProviderCounts: Record<string, number>;
  routeWithoutMasterCount: number;
  salesMatchRate: number;
  salesTransactionCount: number;
  salesTruncated: boolean;
  salesUnmatchedCustomerCount: number;
  visitCount: number;
}) {
  const items: string[] = [];
  const cachedRouteCount = Number(routeProviderCounts.cached || 0);
  const estimatedRouteCount = Number(routeProviderCounts.estimated || 0) + Number(routeProviderCounts.unknown || 0);

  if (!isSupabaseSource) {
    items.push("운영 거래처 원장이 연결되지 않았습니다. 데이터 등록에서 거래처를 저장하고 Supabase 연결 상태를 먼저 확인하세요.");
  }
  if (dashboardCount !== masterCount) {
    items.push("대시보드 수치와 거래처 원장 수가 다릅니다. 최신 거래처 등록 또는 저장 상태를 확인하세요.");
  }
  if (dashboardCount > 0 && masterCount > 0 && dashboardCount === masterCount) {
    items.push("거래처 수는 일치합니다. 다음은 주소, 사업자번호, 담당자, 배송권역 필수값 누락 여부를 점검하세요.");
  }
  if (masterWithoutRouteCount > 0) {
    items.push(`거래처 원장에는 있으나 코스에 반영되지 않은 매장이 ${masterWithoutRouteCount.toLocaleString()}곳 있습니다. 코스 생성 기준을 확인하세요.`);
  }
  if (routeWithoutMasterCount > 0) {
    items.push(`코스에는 있으나 원장 기준과 맞지 않는 매장이 ${routeWithoutMasterCount.toLocaleString()}곳 있습니다. 코스 캐시 또는 고객사 선택 기준을 확인하세요.`);
  }
  if (missingAddressCount > 0) {
    items.push(`주소가 없어 지도에 표시되지 않는 매장이 ${missingAddressCount.toLocaleString()}곳 있습니다. 거래처 히스토리에서 주소를 보완하세요.`);
  }
  if (businessNumberMissingCount > 0) {
    items.push(`사업자번호가 없어 국세청 상태조회에서 제외되는 거래처가 ${businessNumberMissingCount.toLocaleString()}곳 있습니다. 거래처 원장에서 사업자번호를 보완하세요.`);
  }
  if (businessStatusNeedsCheckCount > 0) {
    items.push(`국세청 사업자 상태 확인이 필요한 거래처가 ${businessStatusNeedsCheckCount.toLocaleString()}곳 있습니다. 거래처 관리 > 거래처 원장에서 전체 사업자 상태 조회를 실행하세요.`);
  }
  if (masterCount > 0 && masterWithoutRouteCount === 0 && routeWithoutMasterCount === 0) {
    items.push("거래처 원장과 코스 매장 수는 일치합니다. 다음은 코스 거리 계산 기준을 확인하세요.");
  }
  if (estimatedRouteCount > 0) {
    items.push(`티맵 도로 계산 전 매장이 ${estimatedRouteCount.toLocaleString()}곳 있습니다. 지도 홈에서 배송 거리 전체 계산을 실행하세요.`);
  }
  if (cachedRouteCount > 0 && estimatedRouteCount === 0) {
    items.push("코스 거리 기준이 티맵 실제 도로값으로 정리되어 있습니다. 담당자/배송차 필터별 거리합만 추가 점검하면 됩니다.");
  }
  if (visitCount === 0) {
    items.push("방문/메모 히스토리가 없습니다. 현장 방문 기록 또는 배송완료 증빙을 먼저 쌓아야 합니다.");
  }
  if (salesTransactionCount > 0 && salesUnmatchedCustomerCount > 0) {
    items.push(
      `매출 원장에서 거래처 원장과 매칭되지 않는 거래처가 ${salesUnmatchedCustomerCount.toLocaleString()}곳 있습니다(매칭률 ${salesMatchRate}%). 사업자번호 또는 상호명·주소 표기가 거래처 원장과 같은지 확인하세요.`
    );
  }
  if (salesTransactionCount > 0 && salesUnmatchedCustomerCount === 0) {
    items.push("매출 원장의 모든 거래처가 거래처 원장과 매칭되었습니다. 등급·리포트 산정에 안전하게 반영됩니다.");
  }
  if (salesTruncated) {
    items.push("매출 원장이 최근 1,000건 기준으로 먼저 표시되고 있습니다. 매출 원장 > 테이블 하단의 '더 불러오기'로 나머지 거래내역을 이어서 확인하세요.");
  }
  if (duplicateGroupCount > 0) {
    items.push(`같은 상호명이 서로 다른 레코드로 쪼개진 것으로 보이는 거래처가 ${duplicateGroupCount.toLocaleString()}건 있습니다. 거래처 히스토리에서 주소 표기를 확인하고 하나로 정리하세요.`);
  }

  return items.length ? items : ["대시보드, 거래처 원장, 코스, 지도 표시 기준이 일치합니다."];
}
