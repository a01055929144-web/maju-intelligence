import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { refreshPermitLeadRecommendationScores } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST: "기거래처 주변 리드 추천 + 업종 유사도" 점수를 다시 계산합니다(2026-08-24 피드백).
// 거래처 지오코딩·리드 지오코딩을 새로 만들지 않고 기존 리드 탐색(findNearbyPermitLeads) 로직을
// 그대로 재사용하므로, Tmap 호출량은 "리드 탐색(전체 거래처)"을 한 번 돌리는 것과 같습니다 —
// 그래서 버튼으로 명시적으로 눌러야만 실행되게 했습니다(자동 반복 호출 방지).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; radiusKm?: number } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "추천 점수를 갱신할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await refreshPermitLeadRecommendationScores(scope.companyId!, body?.radiusKm);
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead recommendation refresh failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "추천 점수 갱신 중 오류가 발생했습니다." }, { status: 500 });
  }
}
