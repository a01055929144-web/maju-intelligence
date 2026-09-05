/**
 * 구글 리뷰 자동 수집 (Google Places API, 공식 API만 사용 — 스크래핑 없음).
 * 리뷰_자동수집_파이프라인_설계.md의 "옵션 B"를 실제로 구현한 모듈입니다.
 *
 * 다른 선택형 외부 API들(lib/business-status.ts, lib/place-links.ts)과 같은 graceful-degradation
 * 패턴을 따릅니다: GOOGLE_PLACES_API_KEY가 없거나 요청이 실패해도 절대 throw하지 않고 null/빈
 * 결과를 돌려주므로, 호출하는 쪽은 별도 에러 처리 없이 항상 안전하게 호출할 수 있습니다.
 *
 * 요약·키워드 추출 로직은 lib/review-summarizer.ts를 공유합니다(담당자가 네이버·카카오 리뷰를
 * 직접 붙여넣었을 때도 같은 로직을 씁니다). 나중에 LLM 키(Anthropic/OpenAI)를 연결하면 더 자연스러운
 * 요약으로 교체할 수 있도록 syncGoogleReviewsForCustomer()의 반환값에 원본 리뷰 텍스트도 함께 담아둡니다.
 */

import { buildReviewSummary, extractReviewKeywords } from "./review-summarizer";

const PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

function getGooglePlacesApiKey() {
  return (process.env.GOOGLE_PLACES_API_KEY || "").trim();
}

export function isGoogleReviewsApiConfigured() {
  const key = getGooglePlacesApiKey();
  return Boolean(key && key !== "replace-with-google-places-api-key");
}

export type GoogleReviewRow = {
  authorName: string;
  rating: number | null;
  relativeTime: string;
  text: string;
};

export type GoogleReviewSyncResult = {
  summary: string;
  keywords: string[];
  source: string;
  placeName: string;
  rating: number | null;
  userRatingsTotal: number | null;
  reviewCount: number;
  reviews: GoogleReviewRow[];
};

type TextSearchResponse = {
  status?: string;
  results?: Array<{ place_id?: string; name?: string; formatted_address?: string }>;
};

type PlaceDetailsResponse = {
  status?: string;
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{
      author_name?: string;
      rating?: number;
      relative_time_description?: string;
      text?: string;
    }>;
  };
};

async function searchGooglePlaceId(query: string): Promise<{ placeId: string; name: string } | null> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey || !query.trim()) return null;

  try {
    const response = await fetch(
      `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&language=ko&region=kr&key=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as TextSearchResponse;
    if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") return null;
    const top = payload.results?.[0];
    if (!top?.place_id) return null;
    return { placeId: top.place_id, name: top.name || "" };
  } catch {
    return null;
  }
}

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResponse["result"] | null> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey || !placeId) return null;

  try {
    const response = await fetch(
      `${PLACES_DETAILS_URL}?place_id=${encodeURIComponent(
        placeId
      )}&fields=name,rating,user_ratings_total,reviews&language=ko&reviews_no_translations=true&key=${encodeURIComponent(apiKey)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as PlaceDetailsResponse;
    if (payload.status !== "OK") return null;
    return payload.result || null;
  } catch {
    return null;
  }
}

/**
 * 거래처명(+ 주소)으로 구글 Place를 찾아 최근 리뷰(최대 5개, 구글 Place Details의 상한)를
 * 가져오고, 규칙 기반으로 요약·키워드를 만들어 돌려줍니다. API 키가 없거나, 검색 결과가 없거나,
 * 리뷰가 하나도 없으면 null을 돌려줍니다(호출하는 쪽은 이 경우 review_* 컬럼을 건드리지 않아야
 * 합니다 — 이미 수동으로 입력된 값을 빈 결과로 덮어쓰지 않기 위함).
 */
export async function syncGoogleReviewsForCustomer(input: {
  customerName: string;
  address?: string;
}): Promise<GoogleReviewSyncResult | null> {
  if (!isGoogleReviewsApiConfigured()) return null;
  const customerName = input.customerName?.trim();
  if (!customerName) return null;

  const query = [customerName, input.address?.trim()].filter(Boolean).join(" ");
  const place = await searchGooglePlaceId(query);
  if (!place) return null;

  const details = await fetchPlaceDetails(place.placeId);
  if (!details) return null;

  const reviews: GoogleReviewRow[] = (details.reviews || [])
    .filter((review) => review.text?.trim())
    .map((review) => ({
      authorName: review.author_name || "익명",
      rating: typeof review.rating === "number" ? review.rating : null,
      relativeTime: review.relative_time_description || "",
      text: (review.text || "").trim()
    }));

  if (!reviews.length) return null;

  const rating = typeof details.rating === "number" ? details.rating : null;
  const userRatingsTotal = typeof details.user_ratings_total === "number" ? details.user_ratings_total : null;
  const reviewTexts = reviews.map((review) => review.text);
  const leadLine = rating ? `구글 평점 ${rating.toFixed(1)}${userRatingsTotal ? ` (리뷰 ${userRatingsTotal}건)` : ""}` : undefined;

  return {
    summary: buildReviewSummary(reviewTexts, leadLine),
    keywords: extractReviewKeywords(reviewTexts),
    source: "구글 리뷰 자동 수집",
    placeName: details.name || place.name,
    rating,
    userRatingsTotal,
    reviewCount: reviews.length,
    reviews
  };
}
