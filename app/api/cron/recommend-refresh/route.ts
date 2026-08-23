import { NextRequest, NextResponse } from "next/server";
import { refreshAllCompaniesRecommendationScores } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 "추천 점수"(기거래처 근접도 + 업종 유사도)를 다시 계산하는 전용 크론입니다(2026-08-24
 * 피드백: "거래 성사 확률이 높은 곳을 추천해야 한다"). app/api/cron/business-status와 분리한
 * 이유: 그쪽은 이미 60초 예산을 거의 다 쓰고 있고, 이 작업은 거래처 지오코딩(Tmap 호출)이 들어가
 * 시간이 걸릴 수 있어 같이 묶으면 타임아웃 위험이 있습니다. vercel.json에서 business-status보다
 * 늦은 시각으로 스케줄해 그날 새로 들어온 리드까지 반영되게 했습니다(단, Vercel Hobby 플랜은
 * 정확한 분 단위 실행을 보장하지 않고 해당 시간대 안에서 임의로 실행됩니다).
 *
 * Vercel이 CRON_SECRET Bearer 헤더로 서명한 요청만 실행합니다(app/api/cron/business-status와 동일).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET이 설정되지 않아 실행할 수 없습니다." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllCompaniesRecommendationScores();
  return NextResponse.json(result);
}
