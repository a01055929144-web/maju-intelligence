import { NextRequest, NextResponse } from "next/server";
import {
  refreshAllCompaniesBusinessStatuses,
  sendBusinessClosureAlerts,
  sendDailyChurnRiskDigests,
  syncAllCompaniesGovRestaurantLeads,
  syncAllCompaniesLocalDataPermitLeads
} from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily cron target (see vercel.json "crons") that (1) refreshes every company's 사업자 휴업/폐업
 * status against the NTS API, (2) alerts (Telegram) any company whose refresh just found a
 * newly-closed 거래처, and (3) sends a Telegram 이탈 위험 거래처 digest to any company that has
 * configured a telegram_chat_id in 회사 설정. (2) depends on (1)'s result (it only fires on
 * customers that flipped to 폐업 in this run), so it runs after; (3)은 독립적이라 (2)와 병렬로
 * 실행해 전체 실행시간을 줄입니다.
 *
 * 구글 리뷰 자동 수집은 예전에 여기서 매일 전체 회사를 일괄 새로고침했지만(2026-08-18 제거) —
 * Places API는 호출당 비용이 발생하는데, 아무도 열어보지 않는 거래처까지 매일 재조회하면 실제
 * 쓰이지 않는 비용만 쌓입니다. 지금은 담당자가 지도에서 거래처 카드를 열 때만(리뷰가 없거나
 * 오래된 경우) 그 자리에서 수집합니다 — /api/customers/[id]/sync-reviews, lib/store.ts의
 * syncCustomerGoogleReviews() 참고.
 *
 * (4) 지방행정 인허가 데이터개방(localdata.go.kr) 신규 리드 자동 수집 — 기존에는 사용자가
 * 엑셀을 직접 내려받아 업로드해야 했는데(2026-08-19 자동화 추가), LOCALDATA_API_KEY가 설정된
 * 회사에 한해 매일 최근 3일 변경분을 자동으로 가져와 신규 리드로 적재합니다. 키가 없으면
 * syncAllCompaniesLocalDataPermitLeads()가 즉시 빈 결과를 반환하므로(1)~(3)에는 영향이 없습니다.
 *
 * (5) 행정안전부_식품_일반음식점 조회서비스(공공데이터포털, 전국 약 229만 건) 신규 리드 자동
 * 수집 — GOV_RESTAURANT_API_KEY가 설정된 회사에 한해 매일 최근 3일 변경분을 가져와 적재합니다.
 * 이 API는 "최근 변경분만" 걸러주는 요청 파라미터가 없어(전체 스냅샷만 제공) 한 번에 전국을 다
 * 훑을 수 없습니다 — 매일 날짜 기반으로 다른 구간(3만 행)을 훑도록 lib/gov-restaurant.ts에서
 * 회전시켜, 반복 실행하면 결국 전국을 다 훑게 되지만 완전 커버리지까지 며칠~몇 주가 걸릴 수
 * 있습니다. 키가 없으면 syncAllCompaniesGovRestaurantLeads()가 즉시 빈 결과를 반환합니다.
 *
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
  const [closureAlerts, churnRiskDigest, permitLeadSync, govRestaurantLeadSync] = await Promise.all([
    sendBusinessClosureAlerts(businessStatus.closed),
    sendDailyChurnRiskDigests(),
    syncAllCompaniesLocalDataPermitLeads(),
    syncAllCompaniesGovRestaurantLeads()
  ]);
  return NextResponse.json({ businessStatus, closureAlerts, churnRiskDigest, permitLeadSync, govRestaurantLeadSync });
}
