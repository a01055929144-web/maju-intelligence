import type { EnrichmentResultCode } from "../place-links";
import type { PermitLeadExternalEnrichmentResult } from "../store";

export function buildLeadEnrichmentEventOutcome(input: {
  afterAddress?: string;
  afterPhone?: string;
  beforeAddress?: string;
  beforePhone?: string;
  persisted: boolean;
  skippedFields: string[];
  sources: PermitLeadExternalEnrichmentResult["sources"];
  kakaoMatch?: {
    documentCount: number;
    matched: boolean;
    matchedAddress?: string;
    matchedName?: string;
    matchDistanceM: number | null;
    matchMethod?: string;
    phoneFound: boolean;
    placeId?: string;
    appliedPhone?: string;
    proposedPhone?: string;
    queryVariant: string;
    resultCode?: EnrichmentResultCode;
    rejectReason?: string | null;
    nameScore?: number | null;
  };
}) {
  const contactFieldsFilled = [
    !input.beforePhone && Boolean(input.afterPhone),
    !input.beforeAddress && Boolean(input.afterAddress)
  ].filter(Boolean).length;
  const sourceNames = [
    input.sources.placeLinks ? "플레이스 링크" : "",
    input.sources.googleReviews ? "구글 리뷰/평점" : "",
    input.sources.keywordVolume ? "키워드 검색량" : ""
  ].filter(Boolean);

  // 46-2⓪ 결과 코드: 칸을 채웠으면 filled, 이미 연결돼 있고 새로 채운 게 없으면 already_complete, 새로 연결하면 linked, 아니면 카카오 조회 결과(not_found·rejected·error)
  const kakao = input.kakaoMatch;
  const resultCode: EnrichmentResultCode = kakao?.matched
    ? contactFieldsFilled > 0 ? "filled" : kakao.queryVariant === "existing" ? "already_complete" : "linked"
    : kakao?.resultCode ?? "not_found";

  return {
    message: sourceNames.length ? `${sourceNames.join(", ")} 확인` : "외부 정보 확인 결과 없음",
    metadata: {
      contact_fields_filled: contactFieldsFilled,
      event_type: "external_info_enrichment",
      kakao_document_count: input.kakaoMatch?.documentCount ?? 0,
      kakao_match_distance_m: input.kakaoMatch?.matchDistanceM ?? null,
      kakao_matched: input.kakaoMatch?.matched ?? false,
      kakao_phone_found: input.kakaoMatch?.phoneFound ?? false,
      kakao_query_variant: input.kakaoMatch?.queryVariant ?? "none",
      result_code: resultCode,
      reject_reason: resultCode === "rejected" ? kakao?.rejectReason ?? null : null,
      name_score: kakao?.nameScore ?? null,
      kakao_place_id: input.kakaoMatch?.placeId || null,
      match_method: input.kakaoMatch?.matchMethod || input.kakaoMatch?.queryVariant || "none",
      matched_address: input.kakaoMatch?.matchedAddress || null,
      matched_name: input.kakaoMatch?.matchedName || null,
      proposed_phone: input.kakaoMatch?.proposedPhone || null,
      applied_phone: input.kakaoMatch?.appliedPhone || null,
      persisted: input.persisted,
      skipped_fields: input.skippedFields,
      sources: input.sources
    },
    operationSucceeded: input.persisted && (contactFieldsFilled > 0 || sourceNames.length > 0),
    retrySucceeded: contactFieldsFilled > 0
  };
}

export function shouldAutoApplyKakaoPhone(queryVariant: string) {
  return queryVariant !== "name_only";
}

export function shouldClearKakaoPhoneOnReject(currentPhone?: string | null, appliedPhone?: string | null) {
  return Boolean(appliedPhone?.trim() && currentPhone?.trim() === appliedPhone.trim());
}
