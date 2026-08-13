export type PlaceLinkInput = {
  address?: string;
  customerName: string;
};

export type PlaceLinks = {
  googleMapUrl: string;
  kakaoPlaceUrl: string;
  naverPlaceUrl: string;
  naverBlogSearchUrl: string;
  checkedAt: string | null;
  enrichedPhone: string;
  enrichedIndustry: string;
};

type ExistingPlaceLinks = Partial<Pick<PlaceLinks, "googleMapUrl" | "kakaoPlaceUrl" | "naverPlaceUrl">>;

export async function resolvePlaceLinks(input: PlaceLinkInput, existing: ExistingPlaceLinks = {}): Promise<PlaceLinks> {
  const query = buildPlaceSearchQuery(input);
  const fallbackLinks = buildPlaceSearchLinks(query);
  const kakaoResult = await resolveKakaoPlace(query);
  const kakaoPlaceUrl = existing.kakaoPlaceUrl?.trim() || kakaoResult.placeUrl || fallbackLinks.kakaoPlaceUrl;
  const naverPlaceUrl = existing.naverPlaceUrl?.trim() || (await resolveNaverPlaceUrl(query)) || fallbackLinks.naverPlaceUrl;
  const googleMapUrl = existing.googleMapUrl?.trim() || fallbackLinks.googleMapUrl;
  const checkedAt = naverPlaceUrl || kakaoPlaceUrl || googleMapUrl ? new Date().toISOString() : null;

  return {
    googleMapUrl,
    kakaoPlaceUrl,
    naverPlaceUrl,
    naverBlogSearchUrl: buildNaverBlogSearchUrl(query),
    checkedAt,
    enrichedPhone: kakaoResult.phone,
    enrichedIndustry: kakaoResult.industry
  };
}

export function buildPlaceSearchLinks(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return {
    googleMapUrl: `https://www.google.com/maps/search/${encodedQuery}`,
    kakaoPlaceUrl: `https://map.kakao.com/?q=${encodedQuery}`,
    // search.naver.com은 일반 웹검색 결과라 특정 매장 상세(리뷰·영업시간)로 바로 연결되지 않는 경우가 많습니다.
    // map.naver.com/p/search는 지도 검색 딥링크로, 상호명+주소로 유일하게 매칭되면 해당 매장 상세 패널로 바로 이동합니다.
    naverPlaceUrl: `https://map.naver.com/p/search/${encodedQuery}`
  };
}

export function buildNaverBlogSearchUrl(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return `https://section.blog.naver.com/Search/Post.naver?keyword=${encodedQuery}`;
}

function buildPlaceSearchQuery(input: PlaceLinkInput) {
  return [input.customerName, input.address].map((value) => value?.trim()).filter(Boolean).join(" ");
}

type KakaoPlaceResult = {
  placeUrl: string;
  phone: string;
  industry: string;
};

async function resolveKakaoPlace(query: string): Promise<KakaoPlaceResult> {
  const empty: KakaoPlaceResult = { placeUrl: "", phone: "", industry: "" };
  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey || restKey === "replace-with-kakao-rest-api-key" || !query.trim()) return empty;

  try {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`, {
      headers: {
        Authorization: `KakaoAK ${restKey}`
      },
      cache: "no-store"
    });

    if (!response.ok) return empty;
    const payload = (await response.json()) as {
      documents?: Array<{ id?: string; place_url?: string; phone?: string; category_name?: string }>;
    };
    const place = payload.documents?.[0];
    if (!place) return empty;

    const placeUrl = place.place_url || (place.id ? `https://place.map.kakao.com/${place.id}` : "");
    // category_name은 "음식점 > 곱창,막창 > 곱창전골" 형태라 가장 구체적인 마지막 구간만 업종으로 사용합니다.
    const industry = place.category_name?.split(">").map((part) => part.trim()).filter(Boolean).pop() || "";

    return {
      placeUrl,
      phone: place.phone?.trim() || "",
      industry
    };
  } catch {
    return empty;
  }
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
