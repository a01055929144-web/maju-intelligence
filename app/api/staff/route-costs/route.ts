import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { shouldScopeCustomerSession } from "@/lib/customer-data-scope";
import { getStaffRouteDailySummaries } from "@/lib/store";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get("days")) || 30;
  const scopedUserId = shouldScopeCustomerSession(scope.customerSession)
    ? scope.customerSession?.userId
    : request.nextUrl.searchParams.get("userId") || undefined;

  try {
    const summaries = await getStaffRouteDailySummaries(scope.companyId, {
      days,
      userId: scopedUserId || undefined
    });
    const totals = summaries.reduce(
      (acc, item) => ({
        actualDistanceKm: Math.round((acc.actualDistanceKm + item.actualDistanceKm) * 100) / 100,
        drivingMinutes: acc.drivingMinutes + item.drivingMinutes,
        estimatedFuelCostWon: acc.estimatedFuelCostWon + item.estimatedFuelCostWon,
        estimatedLaborCostWon: acc.estimatedLaborCostWon + item.estimatedLaborCostWon,
        estimatedTotalCostWon: acc.estimatedTotalCostWon + item.estimatedTotalCostWon,
        locationEventCount: acc.locationEventCount + item.locationEventCount,
        visitedCustomerCount: acc.visitedCustomerCount + item.visitedCustomerCount
      }),
      {
        actualDistanceKm: 0,
        drivingMinutes: 0,
        estimatedFuelCostWon: 0,
        estimatedLaborCostWon: 0,
        estimatedTotalCostWon: 0,
        locationEventCount: 0,
        visitedCustomerCount: 0
      }
    );

    return NextResponse.json({ summaries, totals });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "일자별 배송 비용을 불러오지 못했습니다." }, { status: 400 });
  }
}
