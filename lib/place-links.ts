export type PlaceLinkInput = {
  address?: string;
  customerName: string;
  latitude?: number;
  longitude?: number;
  rejectedKakaoPlaceIds?: string[];
};

export type KakaoQueryVariant = "existing" | "name_only" | "region" | "region_detail" | "none";

export type PlaceLinks = {
  googleMapUrl: string;
  kakaoPlaceUrl: string;
  naverPlaceUrl: string;
  naverBlogSearchUrl: string;
  checkedAt: string | null;
  enrichedPhone: string;
  enrichedIndustry: string;
  enrichedAddress: string;
  kakaoMatched: boolean;
  kakaoQueryVariant: KakaoQueryVariant;
  kakaoDocumentCount: number;
  kakaoPhoneFound: boolean;
  kakaoMatchDistanceM: number | null;
  kakaoMatchedAddress: string;
  kakaoMatchedName: string;
  kakaoPlaceId: string;
  naverMatched: boolean;
};

type ExistingPlaceLinks = Partial<Pick<PlaceLinks, "googleMapUrl" | "kakaoPlaceUrl" | "naverPlaceUrl">>;

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
    enrichedAddress: kakaoResult.address,
    kakaoMatched: kakaoResult.matched,
    kakaoQueryVariant: kakaoResult.queryVariant,
    kakaoDocumentCount: kakaoResult.documentCount,
    kakaoPhoneFound: Boolean(kakaoResult.phone),
    kakaoMatchDistanceM: kakaoResult.distanceM,
    kakaoMatchedAddress: kakaoResult.matchedAddress,
    kakaoMatchedName: kakaoResult.matchedName,
    kakaoPlaceId: kakaoResult.placeId,
    naverMatched: Boolean(resolvedNaverPlaceUrl)
  };
}

export function buildPlaceSearchLinks(input: PlaceLinkInput) {
  const fullQuery = buildPlaceSearchQuery(input) || "거래처";
  const encodedFullQuery = encodeURIComponent(fullQuery);
  // 네이버 지도는 "상호명 + 상세주소(동/호수·층수 포함)"로 검색하면 네이버 DB에 등록된 주소 표기와
  // 조금만 달라도 결과가 아예 없거나 엉뚱한 곳으로 연결되는 경우가 많았습니다(사용자 리포트로 확인).
  // 반면 상호명 단독 검색은 해당 업체가 최상단에 뜨는 경우가 훨씬 많아, 네이버만 상호명만으로 검색합니다.
  const naverQuery = input.customerName?.trim() || fullQuery;
  return {
    googleMapUrl: `https://www.google.com/maps/search/${encodedFullQuery}`,
    kakaoPlaceUrl: `https://map.kakao.com/?q=${encodedFullQuery}`,
    naverPlaceUrl: `https://map.naver.com/p/search/${encodeURIComponent(naverQuery)}`
  };
}

export function buildNaverBlogSearchUrl(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedQuery}`;
}

function buildPlaceSearchQuery(input: PlaceLinkInput) {
  return [input.customerName, input.address].map((value) => value?.trim()).filter(Boolean).join(" ");
}

export type KakaoPlaceResult = {
  placeUrl: string;
  phone: string;
  industry: string;
  address: string;
  distanceM: number | null;
  documentCount: number;
  matched: boolean;
  matchedAddress: string;
  matchedName: string;
  placeId: string;
  queryVariant: KakaoQueryVariant;
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
  matched: false,
  matchedAddress: "",
  matchedName: "",
  placeId: "",
  phone: "",
  placeUrl: "",
  queryVariant: "none"
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
    { query: name, variant: "name_only" as const }
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

export function isKakaoPlaceCandidate(input: PlaceLinkInput, document: KakaoKeywordDocument) {
  const expectedName = normalizePlaceName(input.customerName);
  const candidateName = normalizePlaceName(document.place_name || "");
  if (!expectedName || !candidateName || (!expectedName.includes(candidateName) && !candidateName.includes(expectedName))) return false;

  const expectedDistrict = extractKoreanAddressSearchParts(input.address || "").sigungu;
  const candidateAddress = document.road_address_name || document.address_name || "";
  const candidateDistrict = extractKoreanAddressSearchParts(candidateAddress).sigungu;
  if (expectedDistrict && candidateDistrict !== expectedDistrict) return false;

  const distanceM = kakaoCandidateDistanceM(input, document);
  return distanceM == null || distanceM <= 1000;
}

export function isAllowedKakaoPlaceCandidate(input: PlaceLinkInput, document: KakaoKeywordDocument) {
  const rejectedPlaceIds = new Set((input.rejectedKakaoPlaceIds || []).map((value) => value.trim()).filter(Boolean));
  return !rejectedPlaceIds.has(document.id?.trim() || "") && isKakaoPlaceCandidate(input, document);
}

function normalizePlaceName(value: string) {
  return value.toLowerCase().replace(/\(주\)|주식회사/g, "").replace(/[^0-9a-z가-힣]/g, "");
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
  const empty = emptyKakaoPlaceResult();
  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey || restKey === "replace-with-kakao-rest-api-key") return empty;

  let inspectedDocuments = 0;
  for (const attempt of buildKakaoPlaceSearchQueries(input)) {
    try {
      const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(attempt.query)}&size=10`, {
      headers: {
        Authorization: `KakaoAK ${restKey}`
      },
      cache: "no-store"
      });

      if (!response.ok) continue;
      const payload = (await response.json()) as { documents?: KakaoKeywordDocument[] };
      const documents = payload.documents || [];
      inspectedDocuments += documents.length;
      const place = documents.find((document) => isAllowedKakaoPlaceCandidate(input, document));
      if (!place) continue;

      const placeUrl = place.place_url || (place.id ? `https://place.map.kakao.com/${place.id}` : "");
      const industry = place.category_name?.split(">").map((part) => part.trim()).filter(Boolean).pop() || "";

      return {
        placeUrl,
        phone: place.phone?.trim() || "",
        industry,
        address: place.road_address_name?.trim() || place.address_name?.trim() || "",
        distanceM: kakaoCandidateDistanceM(input, place),
        documentCount: documents.length,
        matched: Boolean(placeUrl),
        matchedAddress: place.road_address_name?.trim() || place.address_name?.trim() || "",
        matchedName: place.place_name?.trim() || "",
        placeId: place.id?.trim() || "",
        queryVariant: attempt.variant
      };
    } catch {
      continue;
    }
  }
  return emptyKakaoPlaceResult(inspectedDocuments);
}

async function resolveNaverPlaceUrl(query: string): Promise<string> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret || clientId === "replace-with-naver-client-id" || !query.trim()) return "";

  try {
    const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=1`, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      },
      cache: "no-store"
    });

    if (!response.ok) return "";
    const payload = (await response.json()) as { items?: Array<{ link?: string }> };
    const link = payload.items?.[0]?.link?.trim();
    // 네이버 지역검색 API의 link 필드는 지도 상세 페이지가 아니라 업체 자체 홈페이지인 경우가 대부분입니다.
    // map.naver.com 도메인으로 확인될 때만 신뢰하고, 그 외에는 빈 값을 돌려줘 map.naver.com/p/search 딥링크로 대체합니다.
    return link && /^https:\/\/(m\.|pcmap\.|new\.)?map\.naver\.com\//.test(link) ? link : "";
  } catch {
    return "";
  }
}
