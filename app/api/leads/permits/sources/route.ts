import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isGoogleReviewsApiConfigured } from "@/lib/google-reviews";
import { isGovRestaurantApiConfigured } from "@/lib/gov-restaurant";
import { isNaverDatalabConfigured } from "@/lib/naver-datalab";
import { isSeoulOpenDataConfigured } from "@/lib/seoul-restaurant";
import { getLeadSyncStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 소스 상태를 확인할 권한이 없습니다." }, { status: 403 });
  }

  // 2026-08-28 피드백 대응(리드 야간 동기화가 실패해도 화면에 표시가 없음): 마지막 동기화
  // 시각·성공여부를 함께 내려줘, 화면에서 "어제 진짜 신규 매물이 없었던 건지 동기화가 실패한
  // 건지" 구분할 수 있게 합니다.
  const syncStatus = scope.companyId ? await getLeadSyncStatus(scope.companyId).catch(() => null) : null;

  return NextResponse.json({
    enrichment: {
      googleReviews: isGoogleReviewsApiConfigured(),
      keywordVolume: isNaverDatalabConfigured()
    },
    sources: {
      govRestaurant: isGovRestaurantApiConfigured(),
      seoulRestaurant: isSeoulOpenDataConfigured()
    },
    syncStatus
  });
}
