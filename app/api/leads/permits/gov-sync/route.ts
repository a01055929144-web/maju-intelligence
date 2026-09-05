import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { syncGovRestaurantLeads } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: 행정안전부_식품_일반음식점 조회서비스(전국 공공데이터)에서 최근 변경분을 가져와 신규
// 리드로 적재합니다. 화면의 "지금 가져오기(전국 공공데이터)" 버튼에서 호출합니다.
// GOV_RESTAURANT_API_KEY가 없으면 configured: false를 반환하고, 화면은 이를 "API 키 필요"
// 안내로 표시합니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; days?: number } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "신규 리드를 수집할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const days = Number.isFinite(body?.days) && Number(body?.days) > 0 ? Number(body?.days) : 3;
    const result = await syncGovRestaurantLeads(scope.companyId!, days);
    if (!result.configured) {
      return NextResponse.json(
        { message: "GOV_RESTAURANT_API_KEY가 설정되지 않아 자동 수집을 실행할 수 없습니다. 관리자에게 문의하세요.", ...result },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("gov restaurant permit sync failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "자동 수집 중 오류가 발생했습니다." }, { status: 500 });
  }
}
