/**
 * 구글 리뷰 자동 수집 (Google Places API, 공식 API만 사용 — 스크래핑 없음).
 * 리뷰_자동수집_파이프라인_설계.md의 "옵션 B"를 실제로 구현한 모듈입니다.
 *
 * 다른 선택형 외부 API들(lib/business-status.ts, lib/place-links.ts)과 같은 graceful-degradation
 * 패턴을 따릅니다: GOOGLE_PLACES_API_KEY가 없거나 요청이 실패해도 절대 throw하지 않고 null/빈
 * 결과를 돌려주므로, 호출하는 쪽은 별도 에러 처리 없이 항상 안전하게 호출할 수 있습니다.
 *
 * 요약·키워드는 별도의 LLM API 키 없이, 실제로 수집한 리뷰 텍스트만으로 만드는 규칙 기반
 * 요약기(summarizeReviews)를 사용합니다. 나중에 LLM 키(Anthropic/OpenAI)를 연결하면 더 자연스러운
 * 요약으로 교체할 수 있도록 syncGoogleReviewsForCustomer()의 반환값에 원본 리뷰 텍스트도 함께 담아둡니다.
 */

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

// 한국어 리뷰 텍스트에서 의미 있는 키워드를 뽑아내기 위한 최소 불용어 목록입니다. 완벽한
// 형태소 분석은 아니지만, LLM 호출 없이도 "가성비", "친절", "재방문" 같은 실제로 반복되는
// 단어를 상위로 끌어올리기에는 충분합니다.
const REVIEW_STOPWORDS = new Set([
  "정말", "진짜", "너무", "그리고", "그런데", "하지만", "여기", "저기", "이곳", "정도", "조금",
  "완전", "엄청", "그냥", "아주", "매우", "같아요", "같습니다", "했어요", "입니다", "있어요",
  "없어요", "좋아요", "좋았어요", "였어요", "합니다", "해서", "에서", "에게", "으로", "까지",
  "부터", "한테", "그래서", "이것", "저것", "우리", "제가", "저는", "제일", "오늘", "다음",
  "자주", "항상", "계속", "그리고요", "근데", "이번", "지난번", "사장님", "직원분", "직원분들"
]);

function tokenizeReview(text: string): string[] {
  return text
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !REVIEW_STOPWORDS.has(token));
}

function extractKeywords(reviews: GoogleReviewRow[], limit = 5): string[] {
  const frequency = new Map<string, number>();
  for (const review of reviews) {
    // 리뷰 하나당 토큰을 한 번씩만 세어(Set), 리뷰 하나가 길다고 그 안의 단어가 과대 반영되지
    // 않도록 합니다 — 실제로 "여러 리뷰에 걸쳐 반복되는" 단어를 우선합니다.
    const uniqueTokens = Array.from(new Set(tokenizeReview(review.text || "")));
    for (const token of uniqueTokens) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }

  const sorted = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);
  // 리뷰가 3건 이상이면 최소 2건 이상에서 등장한 단어만 채택해 우연히 한 번 나온 단어를 거릅니다.
  const filtered = reviews.length >= 3 ? sorted.filter(([, count]) => count >= 2) : sorted;
  return (filtered.length ? filtered : sorted).slice(0, limit).map(([token]) => token);
}

function buildSummary(reviews: GoogleReviewRow[], rating: number | null, userRatingsTotal: number | null): string {
  const parts: string[] = [];
  if (rating) {
    parts.push(`구글 평점 ${rating.toFixed(1)}${userRatingsTotal ? ` (리뷰 ${userRatingsTotal}건)` : ""}`);
  }
  const bestReview = [...reviews].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0];
  if (bestReview?.text) {
    const normalized = bestReview.text.trim().replace(/\s+/g, " ");
    const snippet = normalized.slice(0, 140);
    parts.push(`리뷰 예시: "${snippet}${normalized.length > 140 ? "…" : ""}"`);
  }
  return parts.join(" · ");
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

  return {
    summary: buildSummary(reviews, rating, userRatingsTotal),
    keywords: extractKeywords(reviews),
    source: "구글 리뷰 자동 수집",
    placeName: details.name || place.name,
    rating,
    userRatingsTotal,
    reviewCount: reviews.length,
    reviews
  };
}
