import { kakaoNameVariants, normalizePlaceName, placeNameScore } from "../domains/lead/place-name";

export { kakaoNameVariants, placeNameScore };
export type PlaceLinkInput = {
  address?: string;
  customerName: string;
  latitude?: number;
  longitude?: number;
  rejectedKakaoPlaceIds?: string[];
};

export type KakaoQueryVariant =
  | "existing" | "name_only" | "region" | "region_detail" | "none"
  | "paren_stripped" | "corp_stripped" | "branch_stripped" | "no_space";

/** 46-2⓪ 결과 코드. 성공 = filled + linked + already_complete. filled/already_complete는 저장 단계(store)에서 정한다. */
export type EnrichmentResultCode = "filled" | "linked" | "already_complete" | "not_found" | "rejected" | "error";
export type KakaoRejectReason = "distance_exceeded" | "name_mismatch" | "address_mismatch" | "previously_rejected";

export type PlaceLinks = {
  googleMapUrl: string;
  kakaoPlaceUrl: string;
  naverPlaceUrl: string;
  naverBlogSearchUrl: string;
  checkedAt: string | null;
  enrichedPhone: string;
  enrichedIndustry: string;
  kakaoCategoryName: string;
  enrichedAddress: string;
  kakaoMatched: boolean;
  kakaoQueryVariant: KakaoQueryVariant;
  kakaoDocumentCount: number;
  kakaoPhoneFound: boolean;
  kakaoMatchDistanceM: number | null;
  kakaoMatchedAddress: string;
  kakaoMatchedName: string;
  kakaoPlaceId: string;
  kakaoResultCode: EnrichmentResultCode;
  kakaoRejectReason: KakaoRejectReason | null;
  kakaoRejectedDistanceM: number | null;
  kakaoNameScore: number | null;
  naverMatched: boolean;
};

type ExistingPlaceLinks = Partial<Pick<PlaceLinks, "googleMapUrl" | "kakaoPlaceUrl" | "naverPlaceUrl">>;

export type NaverLocalCandidate = {
  title?: string;
  link?: string;
  address?: string;
  roadAddress?: string;
};

export type NaverLocalLinkKind = "instagram" | "naver_blog" | "homepage" | "naver_map" | "unsupported";

export function classifyNaverLocalLink(value?: string): { kind: NaverLocalLinkKind; url: string } {
  const raw = value?.trim() || "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "unsupported", url: "" };
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return { kind: "instagram", url: url.toString() };
    if (hostname === "blog.naver.com") return { kind: "naver_blog", url: url.toString() };
    if (hostname === "map.naver.com" || hostname.endsWith(".map.naver.com")) return { kind: "naver_map", url: url.toString() };
    return { kind: "homepage", url: url.toString() };
  } catch {
    return { kind: "unsupported", url: "" };
  }
}

export function isNaverLocalCandidateMatch(input: PlaceLinkInput, candidate: NaverLocalCandidate) {
  const expectedName = normalizePlaceName(input.customerName);
  const candidateName = normalizePlaceName(candidate.title || "");
  if (!expectedName || !candidateName || (!expectedName.includes(candidateName) && !candidateName.includes(expectedName))) {
    return false;
  }

  const expectedAddress = normalizeComparableAddress(input.address || "");
  if (!expectedAddress) return false;
  return [candidate.roadAddress, candidate.address]
    .map((address) => normalizeComparableAddress(address || ""))
    .some((address) => Boolean(address) && (expectedAddress.includes(address) || address.includes(expectedAddress)));
}

export function planNaverLocalLinkEnrichment(
  input: PlaceLinkInput,
  candidate: NaverLocalCandidate,
  existing: { instagramUrl?: string | null } = {}
) {
  const matched = isNaverLocalCandidateMatch(input, candidate);
  const classified = classifyNaverLocalLink(candidate.link);
  const preservesExistingInstagram = classified.kind === "instagram" && Boolean(existing.instagramUrl?.trim());
  return {
    matched,
    kind: matched ? classified.kind : "unsupported" as NaverLocalLinkKind,
    proposedUrl: matched && !preservesExistingInstagram ? classified.url : "",
    preservesExistingInstagram,
    writeEnabled: false
  };
}

export async function resolvePlaceLinks(input: PlaceLinkInput, existing: ExistingPlaceLinks = {}): Promise<PlaceLinks> {
  const query = buildPlaceSearchQuery(input);
  const fallbackLinks = buildPlaceSearchLinks(input);
  const existingKakaoUrl = existing.kakaoPlaceUrl?.trim() || "";
  const existingKakaoMatched = isActualKakaoPlaceUrl(existingKakaoUrl);
  const freshKakaoResult = await resolveKakaoPlace(input);
  const kakaoResult = selectKakaoPlaceResult(freshKakaoResult, existingKakaoMatched ? existingKakaoUrl : undefined);
  const kakaoPlaceUrl = existingKakaoMatched ? existingKakaoUrl : kakaoResult.placeUrl || fallbackLinks.kakaoPlaceUrl;
  const existingNaverUrl = existing.naverPlaceUrl?.trim() || "";
  const resolvedNaverPlaceUrl = isActualNaverPlaceUrl(existingNaverUrl) ? existingNaverUrl : await resolveNaverPlaceUrl(query);
  const naverPlaceUrl = resolvedNaverPlaceUrl || existingNaverUrl || fallbackLinks.naverPlaceUrl;
  const googleMapUrl = existing.googleMapUrl?.trim() || fallbackLinks.googleMapUrl;
  const checkedAt = naverPlaceUrl || kakaoPlaceUrl || googleMapUrl ? new Date().toISOString() : null;

  return {
    googleMapUrl,
    kakaoPlaceUrl,
    naverPlaceUrl,
    naverBlogSearchUrl: buildNaverBlogSearchUrl(query),
    checkedAt,
    enrichedPhone: kakaoResult.phone,
    enrichedIndustry: kakaoResult.industry,
    kakaoCategoryName: kakaoResult.categoryName,
    enrichedAddress: kakaoResult.address,
    kakaoMatched: kakaoResult.matched,
    kakaoQueryVariant: kakaoResult.queryVariant,
    kakaoDocumentCount: kakaoResult.documentCount,
    kakaoPhoneFound: Boolean(kakaoResult.phone),
    kakaoMatchDistanceM: kakaoResult.distanceM,
    kakaoMatchedAddress: kakaoResult.matchedAddress,
    kakaoMatchedName: kakaoResult.matchedName,
    kakaoPlaceId: kakaoResult.placeId,
    kakaoResultCode: kakaoResult.resultCode,
    kakaoRejectReason: kakaoResult.rejectReason,
    kakaoRejectedDistanceM: kakaoResult.rejectedDistanceM,
    kakaoNameScore: kakaoResult.nameScore,
    naverMatched: Boolean(resolvedNaverPlaceUrl)
  };
}

export function buildPlaceSearchLinks(input: PlaceLinkInput) {
  const fullQuery = buildPlaceSearchQuery(input) || "거래처";
  // 네이버 지도는 "상호명 + 상세주소(동/호수·층수 포함)"로 검색하면 네이버 DB에 등록된 주소 표기와
  // 조금만 달라도 결과가 아예 없거나 엉뚱한 곳으로 연결되는 경우가 많았습니다(사용자 리포트로 확인).
  // 반면 상호명 단독 검색은 해당 업체가 최상단에 뜨는 경우가 훨씬 많아, 네이버만 상호명만으로 검색합니다.
  // 11/4: 카카오·구글도 상세주소(층·호수)까지 넣으면 검색이 안 되는 경우가 많아 "상호명 + 시·군·구"로 통일합니다.
  const district = extractDistrict(input.address);
  const shortQuery = [input.customerName?.trim(), district].filter(Boolean).join(" ") || fullQuery;
  return {
    googleMapUrl: `https://www.google.com/maps/search/${encodeURIComponent(shortQuery)}`,
    kakaoPlaceUrl: `https://map.kakao.com/?q=${encodeURIComponent(shortQuery)}`,
    naverPlaceUrl: `https://map.naver.com/p/search/${encodeURIComponent(shortQuery)}`
  };
}

export function buildNaverBlogSearchUrl(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedQuery}`;
}

function extractDistrict(address?: string | null) {
  const tokens = (address || "").trim().split(/\s+/);
  return tokens.find((token, index) => index > 0 && /(구|군|시)$/.test(token)) || "";
}

function buildPlaceSearchQuery(input: PlaceLinkInput) {
  return [input.customerName, input.address].map((value) => value?.trim()).filter(Boolean).join(" ");
}

export type KakaoPlaceResult = {
  placeUrl: string;
  phone: string;
  industry: string;
  categoryName: string;
  address: string;
  distanceM: number | null;
  documentCount: number;
  matched: boolean;
  matchedAddress: string;
  matchedName: string;
  placeId: string;
  queryVariant: KakaoQueryVariant;
  resultCode: EnrichmentResultCode;
  /** rejected일 때만: 상호 점수가 가장 높았던 후보를 버린 이유·거리·상호 점수 */
  rejectReason: KakaoRejectReason | null;
  rejectedDistanceM: number | null;
  nameScore: number | null;
};

type KakaoKeywordDocument = {
  address_name?: string;
  category_name?: string;
  id?: string;
  phone?: string;
  place_name?: string;
  place_url?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

const emptyKakaoPlaceResult = (documentCount = 0): KakaoPlaceResult => ({
  address: "",
  distanceM: null,
  documentCount,
  industry: "",
  categoryName: "",
  matched: false,
  matchedAddress: "",
  matchedName: "",
  placeId: "",
  phone: "",
  placeUrl: "",
  queryVariant: "none",
  resultCode: "not_found",
  rejectReason: null,
  rejectedDistanceM: null,
  nameScore: null
});

function existingKakaoPlaceResult(placeUrl: string): KakaoPlaceResult {
  const placeId = placeUrl.match(/place\.map\.kakao\.com\/(\d+)/)?.[1] || "";
  return { ...emptyKakaoPlaceResult(), matched: true, placeId, placeUrl, queryVariant: "existing" };
}

export function selectKakaoPlaceResult(freshResult: KakaoPlaceResult, existingPlaceUrl?: string) {
  const existingUrl = existingPlaceUrl?.trim() || "";
  if (!isActualKakaoPlaceUrl(existingUrl)) return freshResult;
  const existingResult = existingKakaoPlaceResult(existingUrl);
  if (freshResult.matched && freshResult.placeId === existingResult.placeId) return freshResult;
  return existingResult;
}

export function isActualKakaoPlaceUrl(value?: string) {
  return /^https:\/\/place\.map\.kakao\.com\/\d+/.test(value?.trim() || "");
}

function isActualNaverPlaceUrl(value?: string) {
  const url = value?.trim() || "";
  return /^https:\/\/(m\.|pcmap\.|new\.)?map\.naver\.com\//.test(url) && !url.includes("/p/search/");
}

export function buildKakaoPlaceSearchQueries(input: PlaceLinkInput): Array<{ query: string; variant: Exclude<KakaoQueryVariant, "existing" | "none"> }> {
  const name = input.customerName.trim();
  if (!name) return [];
  const { detail, region } = extractKoreanAddressSearchParts(input.address || "");
  const candidates = [
    region ? { query: `${name} ${region}`, variant: "region" as const } : null,
    detail ? { query: `${name} ${detail}`, variant: "region_detail" as const } : null,
    { query: name, variant: "name_only" as const },
    ...kakaoNameVariants(name).map(({ name: variantName, variant }) => ({ query: region ? `${variantName} ${region}` : variantName, variant }))
  ].filter((item): item is { query: string; variant: Exclude<KakaoQueryVariant, "existing" | "none"> } => Boolean(item));
  return candidates.filter((item, index) => candidates.findIndex((candidate) => candidate.query === item.query) === index);
}

function extractKoreanAddressSearchParts(address: string) {
  const normalized = address.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = normalized.split(" ").filter(Boolean);
  const sido = tokens[0] || "";
  const sigungu = tokens.find((token, index) => index > 0 && /(?:시|군|구)$/.test(token.replace(/[()]/g, "")))?.replace(/[()]/g, "") || "";
  const parentheticalLocality = (normalized.match(/\(([^)]*)\)/)?.[1] || "")
    .split(/[\s,]+/)
    .map((token) => token.replace(/[^가-힣0-9]/g, ""))
    .find((token) => /(?:동|읍|면|리)$/.test(token));
  const road = tokens.map((token) => token.replace(/[(),]/g, "")).find((token) => /(?:로|길)(?:\d+번길)?$/.test(token));
  const region = [sido, sigungu].filter(Boolean).join(" ");
  const detail = [sigungu, parentheticalLocality || road].filter(Boolean).join(" ");
  return { detail, region, sigungu };
}

function kakaoCandidateRejectReason(input: PlaceLinkInput, document: KakaoKeywordDocument): KakaoRejectReason | null {
  const expectedName = normalizePlaceName(input.customerName);
  const candidateName = normalizePlaceName(document.place_name || "");
  if (!expectedName || !candidateName || (!expectedName.includes(candidateName) && !candidateName.includes(expectedName))) return "name_mismatch";

  const expectedDistrict = extractKoreanAddressSearchParts(input.address || "").sigungu;
  const candidateAddress = document.road_address_name || document.address_name || "";
  const candidateDistrict = extractKoreanAddressSearchParts(candidateAddress).sigungu;
  if (expectedDistrict && candidateDistrict !== expectedDistrict) return "address_mismatch";

  const distanceM = kakaoCandidateDistanceM(input, document);
  return distanceM == null || distanceM <= 1000 ? null : "distance_exceeded";
}

export function isKakaoPlaceCandidate(input: PlaceLinkInput, document: KakaoKeywordDocument) {
  return kakaoCandidateRejectReason(input, document) === null;
}

function allowedRejectReason(input: PlaceLinkInput, document: KakaoKeywordDocument): KakaoRejectReason | null {
  const rejectedPlaceIds = new Set((input.rejectedKakaoPlaceIds || []).map((value) => value.trim()).filter(Boolean));
  return rejectedPlaceIds.has(document.id?.trim() || "") ? "previously_rejected" : kakaoCandidateRejectReason(input, document);
}

export function isAllowedKakaoPlaceCandidate(input: PlaceLinkInput, document: KakaoKeywordDocument) {
  return allowedRejectReason(input, document) === null;
}

function normalizeComparableAddress(value: string) {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/서울특별시/g, "서울")
    .replace(/부산광역시/g, "부산")
    .replace(/대구광역시/g, "대구")
    .replace(/인천광역시/g, "인천")
    .replace(/광주광역시/g, "광주")
    .replace(/대전광역시/g, "대전")
    .replace(/울산광역시/g, "울산")
    .replace(/경기도/g, "경기")
    .replace(/[^0-9가-힣]/g, "");
}

function kakaoCandidateDistanceM(input: PlaceLinkInput, document: KakaoKeywordDocument) {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) return null;
  const latitude = Number(document.y);
  const longitude = Number(document.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return Math.round(haversineMeters(input.latitude as number, input.longitude as number, latitude, longitude));
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function resolveKakaoPlace(input: PlaceLinkInput): Promise<KakaoPlaceResult> {
  const empty: KakaoPlaceResult = { ...emptyKakaoPlaceResult(), resultCode: "error" };
  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey || restKey === "replace-with-kakao-rest-api-key") return empty;

  let inspectedDocuments = 0;
  let okResponses = 0;
  let bestReject: { reason: KakaoRejectReason; score: number; distanceM: number | null } | null = null;
  for (const attempt of buildKakaoPlaceSearchQueries(input)) {
    try {
      const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(attempt.query)}&size=10`, {
      headers: {
        Authorization: `KakaoAK ${restKey}`
      },
      cache: "no-store"
      });

      if (!response.ok) continue;
      okResponses += 1;
      const payload = (await response.json()) as { documents?: KakaoKeywordDocument[] };
      const documents = payload.documents || [];
      inspectedDocuments += documents.length;
      const place = documents.find((document) => isAllowedKakaoPlaceCandidate(input, document));
      if (!place) {
        for (const document of documents) {
          const reason = allowedRejectReason(input, document);
          const score = placeNameScore(input.customerName, document.place_name || "");
          if (reason && (!bestReject || score > bestReject.score)) bestReject = { reason, score, distanceM: kakaoCandidateDistanceM(input, document) };
        }
        continue;
      }

      const placeUrl = place.place_url || (place.id ? `https://place.map.kakao.com/${place.id}` : "");
      const industry = place.category_name?.split(">").map((part) => part.trim()).filter(Boolean).pop() || "";

      return {
        placeUrl,
        phone: place.phone?.trim() || "",
        industry,
        categoryName: place.category_name?.trim() || "",
        address: place.road_address_name?.trim() || place.address_name?.trim() || "",
        distanceM: kakaoCandidateDistanceM(input, place),
        documentCount: documents.length,
        matched: Boolean(placeUrl),
        matchedAddress: place.road_address_name?.trim() || place.address_name?.trim() || "",
        matchedName: place.place_name?.trim() || "",
        placeId: place.id?.trim() || "",
        queryVariant: attempt.variant,
        resultCode: "linked",
        rejectReason: null,
        rejectedDistanceM: null,
        nameScore: placeNameScore(input.customerName, place.place_name || "")
      };
    } catch {
      continue;
    }
  }
  if (!okResponses) return empty;
  const base = emptyKakaoPlaceResult(inspectedDocuments);
  const reject = bestReject as { reason: KakaoRejectReason; score: number; distanceM: number | null } | null;
  return reject ? { ...base, resultCode: "rejected", rejectReason: reject.reason, rejectedDistanceM: reject.distanceM, nameScore: reject.score } : base;
}

export type NaverLocalSearch = { result: "linked" | "not_found" | "error"; status: number; link: string; configured: boolean };

// NAVER API HUB(네이버 클라우드) 지역 검색 — 개발자센터 openapi.naver.com 은 2027-06-30 종료. 키는 데이터랩과 같은 NCP_DATALAB_* 를 쓴다.
export async function searchNaverLocal(query: string): Promise<NaverLocalSearch> {
  const clientId = (process.env.NCP_DATALAB_CLIENT_ID || "").trim();
  const clientSecret = (process.env.NCP_DATALAB_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret || !query.trim()) return { result: "error", status: 0, link: "", configured: Boolean(clientId && clientSecret) };

  try {
    const response = await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(query)}&display=1`, {
      headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
      cache: "no-store"
    });
    if (!response.ok) return { result: "error", status: response.status, link: "", configured: true };
    const payload = (await response.json()) as { items?: Array<{ link?: string }> };
    const link = payload.items?.[0]?.link?.trim() ?? "";
    if (!payload.items?.length) return { result: "not_found", status: response.status, link: "", configured: true };
    // link 필드는 지도 상세가 아니라 업체 홈페이지인 경우가 대부분 — map.naver.com 일 때만 신뢰하고 아니면 검색 딥링크로 대체.
    return /^https:\/\/(m\.|pcmap\.|new\.)?map\.naver\.com\//.test(link)
      ? { result: "linked", status: response.status, link, configured: true }
      : { result: "not_found", status: response.status, link: "", configured: true };
  } catch {
    return { result: "error", status: 0, link: "", configured: true };
  }
}

async function resolveNaverPlaceUrl(query: string): Promise<string> {
  return (await searchNaverLocal(query)).link;
}
