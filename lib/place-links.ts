export type PlaceLinkInput = {
  address?: string;
  customerName: string;
};

export type PlaceLinks = {
  googleMapUrl: string;
  kakaoPlaceUrl: string;
  naverPlaceUrl: string;
  checkedAt: string | null;
};

type ExistingPlaceLinks = Partial<Omit<PlaceLinks, "checkedAt">>;

export async function resolvePlaceLinks(input: PlaceLinkInput, existing: ExistingPlaceLinks = {}): Promise<PlaceLinks> {
  const query = buildPlaceSearchQuery(input);
  const fallbackLinks = buildPlaceSearchLinks(query);
  const kakaoPlaceUrl = existing.kakaoPlaceUrl?.trim() || (await resolveKakaoPlaceUrl(query)) || fallbackLinks.kakaoPlaceUrl;
  const naverPlaceUrl = existing.naverPlaceUrl?.trim() || (await resolveNaverPlaceUrl(query)) || fallbackLinks.naverPlaceUrl;
  const googleMapUrl = existing.googleMapUrl?.trim() || fallbackLinks.googleMapUrl;
  const checkedAt = naverPlaceUrl || kakaoPlaceUrl || googleMapUrl ? new Date().toISOString() : null;

  return {
    googleMapUrl,
    kakaoPlaceUrl,
    naverPlaceUrl,
    checkedAt
  };
}

export function buildPlaceSearchLinks(query: string) {
  const encodedQuery = encodeURIComponent(query || "매장");
  return {
    googleMapUrl: `https://www.google.com/maps/search/${encodedQuery}`,
    kakaoPlaceUrl: `https://map.kakao.com/?q=${encodedQuery}`,
    naverPlaceUrl: `https://search.naver.com/search.naver?query=${encodedQuery}`
  };
}

function buildPlaceSearchQuery(input: PlaceLinkInput) {
  return [input.customerName, input.address].map((value) => value?.trim()).filter(Boolean).join(" ");
}

async function resolveKakaoPlaceUrl(query: string) {
  const restKey = process.env.KAKAO_REST_KEY;
  if (!restKey || restKey === "replace-with-kakao-rest-api-key" || !query.trim()) return "";

  try {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`, {
      headers: {
        Authorization: `KakaoAK ${restKey}`
      },
      cache: "no-store"
    });

    if (!response.ok) return "";
    const payload = (await response.json()) as { documents?: Array<{ id?: string; place_url?: string }> };
    const place = payload.documents?.[0];
    return place?.place_url || (place?.id ? `https://place.map.kakao.com/${place.id}` : "");
  } catch {
    return "";
  }
}

async function resolveNaverPlaceUrl(query: string) {
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
    return link && /^https?:\/\//.test(link) ? link : "";
  } catch {
    return "";
  }
}
