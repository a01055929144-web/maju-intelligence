/**
 * 카카오 로컬 키워드 검색(dapi.kakao.com/v2/local/search/keyword.json)으로 "개업일자와 무관하게
 * 이미 운영 중인" 매장을 찾아 영업리드 후보로 씁니다(2026-08-31 피드백: "영업리드(신규리드,
 * 개업일자 아님)도 키워드 검색량으로 영업순위를 알아야 한다 / 영업리드들의 양이 풍부하고 품질이
 * 좋도록 함"). 기존 business_permit_leads 파이프라인은 공공 인허가 "신규 개업" 데이터만 다뤄서,
 * 오래전부터 영업 중인 매장은 리드 풀에 아예 들어오지 못했습니다 — 이 모듈이 그 공백을 채웁니다.
 *
 * lib/leads.ts가 이미 같은 API로 "지역+업종" 텍스트 검색을 하고 있지만(운영 리포트의 White Space
 * 추천 보강용), 여기서는 실제 좌표(x/y/radius) 기반 반경 검색을 씁니다 — 기준점이 거래처/고객사
 * 지정 지역의 좌표로 이미 확정돼 있어 더 정확하고, business_permit_leads와 동일한 반경 개념(km)을
 * 공유해 "리드 탐색" 화면의 나머지 로직과 자연스럽게 맞습니다.
 *
 * 다른 선택형 외부 API(lib/google-reviews.ts, lib/business-status.ts, lib/naver-datalab.ts)와 같은
 * graceful-degradation 패턴: 키가 없거나 요청이 실패해도 절대 throw하지 않고 빈 배열을 반환합니다.
 */

const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

export type KakaoKeywordLeadCandidate = {
  businessName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  industry: string;
};

function getKakaoRestKey() {
  const key = (process.env.KAKAO_REST_KEY || "").trim();
  return key && key !== "replace-with-kakao-rest-api-key" ? key : "";
}

export function isKakaoKeywordLeadSearchConfigured() {
  return Boolean(getKakaoRestKey());
}

type KakaoKeywordDocument = {
  place_name?: string;
  road_address_name?: string;
  address_name?: string;
  phone?: string;
  x?: string; // 경도(longitude)
  y?: string; // 위도(latitude)
};

type KakaoKeywordResponse = {
  documents?: KakaoKeywordDocument[];
};

/**
 * 기준 좌표 주변 radiusMeters 안에서 keyword로 매장을 검색합니다. 카카오 API 응답의 x/y는
 * 문자열(경도/위도, WGS84)입니다 — lib/tmap.ts의 GeoPoint({lat, lng})와 축이 다르니 주의해서 매핑합니다.
 * 실패하거나 키가 없으면 빈 배열을 반환합니다(호출자는 별도 에러 처리 없이 안전하게 사용 가능).
 */
export async function searchKakaoKeywordLeads(
  point: { lat: number; lng: number },
  keyword: string,
  radiusMeters = 2000
): Promise<KakaoKeywordLeadCandidate[]> {
  const restKey = getKakaoRestKey();
  if (!restKey || !keyword.trim()) return [];

  const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
  url.searchParams.set("query", keyword);
  url.searchParams.set("x", String(point.lng));
  url.searchParams.set("y", String(point.lat));
  url.searchParams.set("radius", String(Math.max(500, Math.min(20000, radiusMeters))));
  url.searchParams.set("size", "15");
  url.searchParams.set("sort", "distance");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      cache: "no-store"
    });
    if (!response.ok) return [];

    const payload = (await response.json().catch(() => null)) as KakaoKeywordResponse | null;
    const documents = payload?.documents || [];

    return documents
      .filter((doc) => doc.place_name && doc.x && doc.y)
      .map((doc) => ({
        businessName: doc.place_name || "",
        address: doc.road_address_name || doc.address_name || "",
        phone: doc.phone || "",
        latitude: Number(doc.y),
        longitude: Number(doc.x),
        industry: keyword
      }))
      .filter((candidate) => Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude));
  } catch {
    return [];
  }
}

/**
 * 고객사가 입력한 지역 텍스트(예: "서울 마포구 합정동")를 좌표로 변환합니다. TMAP 지오코더
 * (lib/tmap.ts resolveAddressPoint)가 정식 주소가 아닌 동/구 단위 지역명은 실패하는 경우가 있어,
 * 카카오 키워드 검색으로 지역명을 그대로 검색해 첫 결과의 좌표를 기준점으로 씁니다.
 */
export async function geocodeRegionLabel(label: string): Promise<{ lat: number; lng: number } | null> {
  const restKey = getKakaoRestKey();
  const query = label.trim();
  if (!restKey || !query) return null;

  const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");

  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      cache: "no-store"
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as KakaoKeywordResponse | null;
    const first = payload?.documents?.[0];
    if (!first?.x || !first?.y) return null;

    const lat = Number(first.y);
    const lng = Number(first.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
