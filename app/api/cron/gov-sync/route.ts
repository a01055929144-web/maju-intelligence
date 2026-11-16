import { NextRequest, NextResponse } from "next/server";
import { syncAllCompaniesGovRestaurantLeads } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby 한도(대표 11/16 20:57 Hobby 유지)

/**
 * 공공데이터(행정안전부 일반음식점) 수집만 하는 짧은 정기 실행 주소 (대표 11/16 21:03 ①).
 *
 * Hobby 요금제의 Vercel 정기 실행은 하루 1번이라, 하루 한 번 40초로는 전국 수집이 너무 느리다.
 * GitHub Actions(.github/workflows/gov-sync-schedule.yml)가 15분마다 이 주소를 부르고,
 * 한 번에 40초씩(lib/gov-area-fanout.ts 예산) 수집한 뒤 못 끝낸 지역은 CX-43 이어받기로
 * 다음 실행이 이어 간다.
 *
 * business-status(하루 1번)와 달리 사업자 상태 갱신 · 알림 · 자동결제는 하지 않는다 —
 * 그것들을 15분마다 반복하면 외부 API 쿼터 · 결제 재시도가 늘어난다.
 *
 * 인증: `Authorization: Bearer <GOV_SYNC_CRON_SECRET>`(GitHub 전용) 또는 Vercel 정기 실행과 같은
 * CRON_SECRET. 둘 다 없으면 거절한다.
 */
export async function GET(request: NextRequest) {
  const allowed = [process.env.GOV_SYNC_CRON_SECRET, process.env.CRON_SECRET].filter((value): value is string => Boolean(value));
  if (!allowed.length) {
    return NextResponse.json({ message: "GOV_SYNC_CRON_SECRET이 설정되지 않아 실행할 수 없습니다." }, { status: 500 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!allowed.some((secret) => header === `Bearer ${secret}`)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const result = await syncAllCompaniesGovRestaurantLeads();
  return NextResponse.json({ govRestaurantLeadSync: result });
}
