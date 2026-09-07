import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { checkSyncDailyCap, recordSyncCall } from "@/lib/sync-daily-cap";
import { syncGovRestaurantLeads } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST: 행정안전부_식품_일반음식점 조회서비스(전국 공공데이터)에서 최근 변경분을 가져와 신규
// 리드로 적재합니다. 화면의 "지금 가져오기(전국 공공데이터)" 버튼에서 호출합니다.
// GOV_RESTAURANT_API_KEY가 없으면 configured: false를 반환하고, 화면은 이를 "API 키 필요"
// 안내로 표시합니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; days?: number; startPage?: number } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "신규 리드를 수집할 권한이 없습니다." }, { status: 403 });
  }
  // 2026-09-07 보완: "이어서 계속 수집" 체인이 계속 재클릭되며 공공데이터 API 쿼터를 반복
  // 소모하지 않도록 회사·소스별 하루 호출 상한을 둡니다(정상적인 재수집 여유는 넉넉히 둠).
  const cap = checkSyncDailyCap(scope.companyId!, "gov");
  if (!cap.allowed) {
    return NextResponse.json(
      { message: `오늘 전국 공공데이터 수집을 이미 충분히 진행했습니다(${cap.callsToday}회). 내일 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  try {
    const days = Number.isFinite(body?.days) && Number(body?.days) > 0 ? Number(body?.days) : 3;
    // 2026-09-07 피드백("끊어서 진행하면 더 자세한 데이터") 대응: 화면의 "계속 가져오기"가 지난
    // 호출의 nextStartPage를 그대로 넘겨서, 같은 날 여러 번 눌러도 매번 다른(다음) 구간을 훑도록
    // 합니다. 넘기지 않으면 예전처럼 날짜 기반 회전 구간을 씁니다.
    const startPage = Number.isFinite(body?.startPage) && Number(body?.startPage) > 0 ? Number(body?.startPage) : undefined;
    recordSyncCall(scope.companyId!, "gov");
    const result = await syncGovRestaurantLeads(scope.companyId!, days, startPage);
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
