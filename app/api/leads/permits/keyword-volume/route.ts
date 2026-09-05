import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { enrichPermitLeadKeywordVolume } from "@/lib/store";
import { isNaverDatalabConfigured } from "@/lib/naver-datalab";

export const dynamic = "force-dynamic";

// POST: 화면에서 "영업리드(키워드 검색량순)" 정렬을 켤 때, 지금 보이는 리드 id 목록을 넘기면
// 아직 점수가 없는 리드만 네이버 데이터랩으로 조회해 keyword_volume을 채우고 { [leadId]: score }를
// 돌려줍니다. 화면은 이 값으로 로컬 정렬만 다시 하면 됩니다(전체 리드를 다시 불러오지 않음).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; leadIds?: string[] } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isNaverDatalabConfigured()) {
    return NextResponse.json({ configured: false, scores: {} });
  }

  const leadIds = Array.isArray(body?.leadIds) ? body.leadIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
  if (!leadIds.length) {
    return NextResponse.json({ configured: true, scores: {} });
  }
  if (leadIds.length > 60) {
    return NextResponse.json({ message: "한 번에 60개까지만 조회할 수 있습니다." }, { status: 400 });
  }

  try {
    const scores = await enrichPermitLeadKeywordVolume(scope.companyId!, leadIds);
    return NextResponse.json({ configured: true, scores });
  } catch (error) {
    console.error("permit lead keyword-volume enrichment failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "검색량 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
