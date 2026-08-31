import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { runKakaoKeywordLeadSweep } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: "영업리드 추가 탐색" 수동 버튼. 등록 거래처 반경 + 고객사 지정 지역을 기준점으로 삼아
// 카카오 로컬 키워드 검색으로 개업일자와 무관하게 이미 운영 중인 매장을 찾아 리드로 적재합니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "영업리드를 탐색할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await runKakaoKeywordLeadSweep(scope.companyId!, { mode: "manual" });
    if (!result.configured) {
      return NextResponse.json(
        { message: "KAKAO_REST_KEY가 설정되지 않아 영업리드 탐색을 실행할 수 없습니다. 관리자에게 문의하세요.", ...result },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("kakao keyword lead sweep failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "영업리드 탐색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
