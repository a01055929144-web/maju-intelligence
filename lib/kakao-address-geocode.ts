import { geocodeRegionLabel } from "./kakao-keyword-leads";

// CC-21: 가져온 유통사 주소를 지도 좌표로. 카카오 주소 검색을 먼저, 동·구 같은 지역명은 기존 지역 검색으로. 못 찾으면 null(좌표 없이 저장, 지도에만 안 보임).
const KAKAO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";

export async function geocodeAddress(address: string, fetcher: typeof fetch = fetch): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim().slice(0, 200);
  const restKey = process.env.KAKAO_REST_KEY;
  if (!query || !restKey) return null;
  try {
    const url = new URL(KAKAO_ADDRESS_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("size", "1");
    const response = await fetcher(url, { headers: { Authorization: `KakaoAK ${restKey}` }, cache: "no-store" });
    if (response.ok) {
      const first = ((await response.json().catch(() => null)) as { documents?: Array<{ x?: string; y?: string }> } | null)?.documents?.[0];
      const lat = Number(first?.y), lng = Number(first?.x);
      if (first?.x && first?.y && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) return { lat, lng };
    }
  } catch { /* 네트워크 오류는 아래 지역 검색으로 한 번 더 */ }
  return geocodeRegionLabel(query).catch(() => null);
}
