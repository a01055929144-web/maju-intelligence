import type { PermitLeadPeriod } from "../../domains/lead/permit-lead-state";
import { isMobilePhoneNumber } from "../../domains/lead/contact-channels";
import { recommendLeadNextAction } from "../../domains/lead/next-action";
import type { PermitLeadItem, PermitLeadRow } from "../store";

export function isPermitStatusActive(statusText?: string) {
  if (!statusText) return true;
  const inactiveKeywords = ["폐업", "말소", "취소", "영업정지", "직권말소", "휴업"];
  return !inactiveKeywords.some((keyword) => statusText.includes(keyword));
}

/**
 * v1 점수 산식입니다. 설계 문서의 6개 축 중 5개를 계산합니다: 인허가(개업일 우선) 신선도,
 * 업종 적합도, 연락처/주소 기반 영업 접근성은 실데이터로 바로 계산하고, 키워드 검색량·리뷰
 * 활성도는 외부 보강(네이버 데이터랩 검색량, 구글 리뷰) 값이 들어온 뒤부터 채워집니다
 * (2026-08-24, "영업리드는 영업이 잘되는지·리뷰가 좋은지가 중요하다" 피드백 반영).
 * 나머지 1개(동선 적합도)는 아직 계산 기반이 없어 0점으로 둡니다.
 * 보강 전 리드는 A등급(85점 이상)에 도달하기 어렵지만, 화면은 등급보다 "다음 액션"을
 * 우선 노출하므로(computePermitLeadNextAction 참고) 보강 전이라도 오늘 전화할 곳은 놓치지 않습니다.
 */
export function computePermitLeadScoreBreakdown(input: {
  leadPeriod: PermitLeadPeriod;
  isTarget: boolean;
  industryKnown: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  keywordVolume?: number;
  reviewCount?: number;
  rating?: number;
}) {
  const freshness = input.leadPeriod === "today" ? 30 : input.leadPeriod === "week" ? 22 : input.leadPeriod === "month" ? 14 : 6;
  const industryFit = !input.isTarget ? 0 : input.industryKnown ? 20 : 10;
  const outreachFit = (input.hasPhone ? 6 : 0) + (input.hasAddress ? 2 : 0);

  // 검색량 지수(앵커 "커피"=100 기준 상대값)를 0~15점으로 환산합니다. 대부분의 개별 매장명은
  // 지수가 한 자릿수~수십 대라 15점 만점을 받는 경우는 드물고, 온라인에서 화제가 되는 매장만
  // 높은 점수를 받습니다.
  const keywordDemand =
    typeof input.keywordVolume === "number" && input.keywordVolume > 0 ? Math.min(15, Math.round(input.keywordVolume / 5)) : 0;

  // 리뷰 활성도는 평점(최대 8점)과 리뷰 수(최대 7점, 로그 스케일 — 리뷰 10개와 100개의 차이가
  // 100개와 1000개의 차이보다 체감상 크다고 보고 완만하게 늘어나도록 함)를 합산합니다.
  const ratingPoints = typeof input.rating === "number" && input.rating > 0 ? Math.round((Math.min(input.rating, 5) / 5) * 8) : 0;
  const reviewCountPoints =
    typeof input.reviewCount === "number" && input.reviewCount > 0 ? Math.min(7, Math.round(Math.log10(input.reviewCount + 1) * 3)) : 0;
  const placeActivity = ratingPoints + reviewCountPoints;

  return {
    license_freshness_score: freshness,
    industry_fit_score: industryFit,
    keyword_demand_score: keywordDemand,
    place_activity_score: placeActivity,
    route_fit_score: 0,
    outreach_fit_score: outreachFit
  };
}

export function permitLeadGradeFromScore(scoreTotal: number): "A" | "B" | "C" | null {
  if (scoreTotal >= 85) return "A";
  if (scoreTotal >= 70) return "B";
  if (scoreTotal >= 55) return "C";
  return null;
}

/** 화면에 점수 대신 먼저 보여줄 "다음 액션"과 근거 3줄 이내를 계산합니다. */
export function computePermitLeadNextAction(input: {
  isActive: boolean;
  isDuplicate: boolean;
  isTarget: boolean;
  industryKnown: boolean;
  isNewLead: boolean;
  leadPeriod: PermitLeadPeriod;
  hasPhone: boolean;
  phone?: string;
  hasAddress: boolean;
  industryPrimary: string;
}): { action: string; reasons: string[] } {
  if (!input.isActive) return { action: "제외 검토", reasons: ["사업장 상태가 폐업·휴업·영업정지 등 비활성"] };
  if (input.isDuplicate) return { action: "제외 검토", reasons: ["이미 등록된 거래처와 사업자번호 일치"] };
  if (!input.isTarget) return { action: "제외 검토", reasons: ["식자재 유통 영업 대상 업종이 아님"] };

  if (!input.hasAddress || !input.industryKnown) {
    const reasons: string[] = [];
    if (!input.hasAddress) reasons.push("주소 정보 부족");
    if (!input.industryKnown) reasons.push("업종 분류 확인 필요");
    if (!input.hasPhone) reasons.push("전화번호 없음");
    return { action: "정보 보강", reasons };
  }

  // 2026-09-07 피드백 대응: 개업일이 확인 안 되는 리드(영업리드)를 "최근 90일 신규 인허가"라고
  // 잘못 표시하던 문제를 고칩니다 — leadPeriod가 today/week/month가 아니면 예전엔 무조건 "최근
  // 90일 신규 인허가"라고 썼는데, 실제로는 "날짜를 아예 모르는 경우"와 "확인은 됐지만 90일보다
  // 오래된 경우"가 둘 다 여기 섞여 있었습니다(카카오 키워드 탐색 영업리드도 마찬가지로 날짜가
  // 없어 매번 이 문구가 잘못 붙었습니다). isNewLead가 false면 "개업일 확인 안 됨" 대신 검색량
  // 기반 영업리드라는 근거를 명확히 씁니다.
  const periodLabel = !input.isNewLead
    ? "영업리드(검색량 기반 타겟팅)"
    : input.leadPeriod === "today"
      ? "오늘 신규 인허가"
      : input.leadPeriod === "week"
        ? "이번 주 신규 인허가"
        : input.leadPeriod === "month"
          ? "이번 달 신규 인허가"
          : "최근 90일 신규 인허가";

  const recommendation = recommendLeadNextAction({ phone: input.phone });
  return {
    action: recommendation.label,
    reasons: [periodLabel, `${input.industryPrimary} 업종`, isMobilePhoneNumber(input.phone) ? "010 휴대폰 확인됨" : "유선 콜드콜 제외"]
  };
}

export function toPermitLeadItem(row: PermitLeadRow): PermitLeadItem {
  return {
    id: row.id,
    businessName: row.business_name,
    businessNumber: row.business_number || undefined,
    representativeName: row.representative_name || undefined,
    permitStatus: row.permit_status || undefined,
    isActive: row.is_active,
    permitDate: row.permit_date || undefined,
    targetType: row.target_type === "distributor" ? "distributor" : "restaurant",
    openDate: row.open_date || undefined,
    address: row.address || undefined,
    phone: row.phone || undefined,
    ownerMobilePhone: row.owner_mobile_phone || undefined,
    storePhone: row.store_phone || undefined,
    jurisdiction: row.jurisdiction || undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    leadPeriod: row.lead_period,
    industryPrimary: row.industry_primary || "미분류",
    industryTags: row.industry_tags || [],
    isTargetIndustry: row.is_target_industry,
    isTemporaryOperation: row.status === "임시 영업" || row.exclude_reason === "임시 영업",
    isTemporaryOperationSuspected: row.status === "임시 영업 의심",
    isDuplicate: row.is_duplicate,
    matchedCustomerId: row.matched_customer_id || undefined,
    status: row.status,
    nextAction: row.next_action || undefined,
    nextActionReasons: row.next_action_reasons || [],
    lastContactAt: row.last_contact_at || undefined,
    lastContactChannel: row.last_contact_channel || undefined,
    lastContactSummary: row.last_contact_summary || undefined,
    excludeReason: row.exclude_reason || undefined,
    scoreTotal: row.score_total,
    scoreBreakdown: row.score_breakdown || {},
    grade: (row.grade as "A" | "B" | "C" | null) || null,
    naverPlaceUrl: row.naver_place_url || undefined,
    kakaoPlaceUrl: row.kakao_place_url || undefined,
    googlePlaceUrl: row.google_place_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    fax: row.fax || undefined,
    email: row.email || undefined,
    naverTalktalkUrl: row.naver_talktalk_url || undefined,
    reviewCount: row.review_count ?? undefined,
    rating: row.rating ?? undefined,
    keywordVolume: row.keyword_volume ?? undefined,
    source: row.source || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storeAreaSqm: row.store_area_sqm ?? undefined
  };
}
