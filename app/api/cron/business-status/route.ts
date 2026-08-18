import { NextRequest, NextResponse } from "next/server";
import {
  refreshAllCompaniesBusinessStatuses,
  refreshAllCompaniesGoogleReviews,
  sendBusinessClosureAlerts,
  sendDailyChurnRiskDigests
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron target (see vercel.json "crons") that (1) refreshes every company's 사업자 휴업/폐업
 * status against the NTS API, (2) alerts (Telegram) any company whose refresh just found a
 * newly-closed 거래처, (3) sends a Telegram 이탈 위험 거래처 digest to any company that has
 * configured a telegram_chat_id in 회사 설정, and (4) refreshes stale/missing 구글 리뷰 자동 수집
 * (GOOGLE_PLACES_API_KEY가 설정된 경우만, 회사당 최대 GOOGLE_REVIEWS_REFRESH_LIMIT곳). All four
 * share one Vercel Hobby cron slot. (2) depends on (1)'s result (it only fires on customers that
 * flipped to 폐업 in this run), so it runs after; (3)과 (4)는 서로 독립적이라 (2)와 함께 병렬로
 * 실행해 전체 실행시간을 줄입니다.
 * Vercel signs cron requests with an Authorization: Bearer header matching CRON_SECRET — see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs. Without CRON_SECRET
 * configured, the endpoint refuses all requests rather than running unauthenticated.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET이 설정되지 않아 실행할 수 없습니다." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const businessStatus = await refreshAllCompaniesBusinessStatuses();
  const [closureAlerts, churnRiskDigest, googleReviews] = await Promise.all([
    sendBusinessClosureAlerts(businessStatus.closed),
    sendDailyChurnRiskDigests(),
    refreshAllCompaniesGoogleReviews()
  ]);
  return NextResponse.json({ businessStatus, closureAlerts, churnRiskDigest, googleReviews });
}
