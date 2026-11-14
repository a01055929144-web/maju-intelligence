// 주소 → 좌표 캐시(메모리 + localStorage). 카카오 지도(kakao-address-map)가 쓴다.
// v2: #766(21:54) 대체 검색으로 근처에 놓인 거래처가 approx 표시 없이 v1에 저장돼 '정확'으로 보이던 것을 끊는다.
// 옛 v1 키는 읽지 않고 지운다. 비용: DB 좌표가 없는 주소만 브라우저당 1회 다시 조회.
export const GEOCODE_CACHE_STORAGE_KEY = "maju:kakao-geocode-cache:v2";
export const LEGACY_GEOCODE_CACHE_STORAGE_KEYS = ["maju:kakao-geocode-cache:v1"] as const;
export const GEOCODE_CACHE_MAX_ENTRIES = 3000;

// approx: 주소로 못 찾아 근사 주소·상호 검색으로 놓은 좌표(다음 로드에도 "위치 추정"으로 보이게 같이 저장).
export type GeocodePoint = { lat: number; lng: number; approx?: boolean };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadGeocodeCache(cache: Map<string, GeocodePoint>, storage: StorageLike) {
  try {
    LEGACY_GEOCODE_CACHE_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
    const raw = storage.getItem(GEOCODE_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, GeocodePoint>;
    Object.entries(parsed).forEach(([address, point]) => {
      if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) cache.set(address, point);
    });
  } catch {
    // 캐시 파싱에 실패해도 치명적이지 않습니다 — 그냥 다시 지오코딩하면 됩니다.
  }
}

export function saveGeocodeCache(cache: Map<string, GeocodePoint>, storage: StorageLike) {
  try {
    // 캐시가 무한정 커지지 않도록 최근 항목 위주로만 저장합니다.
    const entries = Array.from(cache.entries()).slice(-GEOCODE_CACHE_MAX_ENTRIES);
    storage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage 용량 초과 등은 무시합니다 — 캐시는 있으면 좋고 없어도 동작에는 지장 없습니다.
  }
}
