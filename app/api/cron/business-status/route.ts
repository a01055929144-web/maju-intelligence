import { NextRequest, NextResponse } from "next/server";
import {
  refreshAllCompaniesBusinessStatuses,
  sendBusinessClosureAlerts,
  sendDailyChurnRiskDigests,
  syncAllCompaniesGovRestaurantLeads,
  syncAllCompaniesKakaoKeywordLeads,
  syncAllCompaniesSeoulRestaurantLeads
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
 * (4) 지방행정 인허가 데이터개방(localdata.go.kr) 자동 수집은 그 API 자체가 2026-04-16 폐쇄되어
 * 2026-08-24 lib/localdata.ts와 함께 제거했습니다 — (5) 행정안전부_식품_일반음식점 조회서비스로
 * 대체됐습니다.
 *
 * (5) 행정안전부_식품_일반음식점 조회서비스(공공데이터포털, 전국 약 229만 건) 신규 리드 자동
 * 수집 — GOV_RESTAURANT_API_KEY가 설정된 회사에 한해 매일 최근 3일 변경분을 가져와 적재합니다.
 * 이 API는 "최근 변경분만" 걸러주는 요청 파라미터가 없어(전체 스냅샷만 제공) 한 번에 전국을 다
 * 훑을 수 없습니다 — 매일 날짜 기반으로 다른 구간(3만 행)을 훑도록 lib/gov-restaurant.ts에서
 * 회전시켜, 반복 실행하면 결국 전국을 다 훑게 되지만 완전 커버리지까지 며칠~몇 주가 걸릴 수
 * 있습니다. 키가 없으면 syncAllCompaniesGovRestaurantLeads()가 즉시 빈 결과를 반환합니다.
 *
 * (6) 서울 열린데이터광장(openapi.seoul.go.kr) 서울시 일반음식점 인허가 정보 자동 수집 —
 * SEOUL_OPENDATA_API_KEY가 설정된 회사에 한해 매일 최근 3일 변경분을 가져와 적재합니다. 서울만
 * 다루는 대신(약 53만 건, 전국판의 1/4 수준) 좌표계가 확정적(EPSG:5174)이라 좌표를 직접
 * 변환해 채우므로 카카오 지오코더를 타지 않습니다. 이 API도 최근 변경분 필터가 없어 매일 다른
 * 구간을 훑도록 회전시킵니다(lib/seoul-restaurant.ts). 키가 없으면 빈 결과를 반환합니다.
 *
 * (7) 2026-08-31 피드백: "영업리드(신규리드, 개업일자 아님)도 키워드 검색량으로 영업순위를 알아야
 * 한다" — (4)~(6)은 전부 "신규 개업" 데이터만 다뤄서 이미 오래 운영 중인 매장은 리드 풀에 못
 * 들어왔습니다. syncAllCompaniesKakaoKeywordLeads()가 등록 거래처 반경 + 고객사 지정 지역을
 * 기준점 삼아 카카오 로컬 키워드 검색으로 그 공백을 채웁니다. Vercel Hobby 플랜은 cron 슬롯이
 * 2개로 제한돼 있어(vercel.json 참고) 새 cron을 추가하지 않고 이 라우트에 합쳤습니다 — 호출량
 * 통제를 위해 회사당 기준점 일부만 매일 회전하며 훑습니다(runKakaoKeywordLeadSweep의 auto 모드).
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
  const [closureAlerts, churnRiskDigest, govRestaurantLeadSync, seoulRestaurantLeadSync, kakaoKeywordLeadSync] = await Promise.all([
    sendBusinessClosureAlerts(businessStatus.closed),
    sendDailyChurnRiskDigests(),
    syncAllCompaniesGovRestaurantLeads(),
    syncAllCompaniesSeoulRestaurantLeads(),
    syncAllCompaniesKakaoKeywordLeads()
  ]);
  return NextResponse.json({
    businessStatus,
    closureAlerts,
    churnRiskDigest,
    govRestaurantLeadSync,
    seoulRestaurantLeadSync,
    kakaoKeywordLeadSync
  });
}
