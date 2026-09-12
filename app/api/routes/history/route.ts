import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, shouldScopeCustomerData } from "@/lib/auth";
import { getDeliveryHistoryForDate, getDeliveryHistorySummary } from "@/lib/store";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

// 2026-09-07 피드백("매일 배송 경로, 경유, 배송완료 여부 등 히스토리 파악 할 수 있도록 해야해,
// 달력으로 표기해서 기간 설정을 하고, 특정일자의 배송 일자를 보면 좋을 것 같아") 대응 API입니다.
// mode=summary&from=YYYY-MM-DD&to=YYYY-MM-DD : 달력에 날짜별 배송완료 건수 배지를 표시하기 위한
//   { "2026-09-01": 12, ... } 형태의 카운트 맵을 돌려줍니다.
// mode=detail&date=YYYY-MM-DD (기본값) : 그 하루의 담당자별 방문 순서/완료 기록/GPS 경로를 돌려줍니다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  }
  if (shouldScopeCustomerData(scope.customerSession)) {
    return NextResponse.json(
      { error: "전체 배송 히스토리는 대표 또는 관리자만 조회할 수 있습니다." },
      { headers: noStoreHeaders, status: 403 }
    );
  }

  const mode = request.nextUrl.searchParams.get("mode") === "summary" ? "summary" : "detail";
  try {
    if (mode === "summary") {
      const from = request.nextUrl.searchParams.get("from") || "";
      const to = request.nextUrl.searchParams.get("to") || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return NextResponse.json({ error: "from, to 날짜(YYYY-MM-DD)가 필요합니다." }, { headers: noStoreHeaders, status: 400 });
      }
      const counts = await getDeliveryHistorySummary(scope.companyId, { from, to });
      return NextResponse.json({ counts }, { headers: noStoreHeaders });
    }

    const date = request.nextUrl.searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date(YYYY-MM-DD)가 필요합니다." }, { headers: noStoreHeaders, status: 400 });
    }
    const history = await getDeliveryHistoryForDate(scope.companyId, date);
    return NextResponse.json({ history }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배송 히스토리를 불러오지 못했습니다." },
      { headers: noStoreHeaders, status: 400 }
    );
  }
}
