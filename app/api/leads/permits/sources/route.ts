import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isGoogleReviewsApiConfigured } from "@/lib/google-reviews";
import { isGovRestaurantApiConfigured } from "@/lib/gov-restaurant";
import { isNaverDatalabConfigured } from "@/lib/naver-datalab";
import { isSeoulOpenDataConfigured } from "@/lib/seoul-restaurant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 소스 상태를 확인할 권한이 없습니다." }, { status: 403 });
  }

  return NextResponse.json({
    enrichment: {
      googleReviews: isGoogleReviewsApiConfigured(),
      keywordVolume: isNaverDatalabConfigured()
    },
    sources: {
      govRestaurant: isGovRestaurantApiConfigured(),
      seoulRestaurant: isSeoulOpenDataConfigured()
    }
  });
}
