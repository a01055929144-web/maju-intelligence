// 48-5: 거래처 좌표(저장된 위도·경도). DB 칸 check와 같은 범위(한국 안)만 받는다. React·Supabase를 모른다.
export const GEOCODE_ACCURACIES = ["exact", "approx", "manual", "lead"] as const;
export type GeocodeAccuracy = (typeof GEOCODE_ACCURACIES)[number];

export type StoredCoordinate = {
  readonly accuracy: GeocodeAccuracy;
  readonly address: string;
  readonly lat: number;
  readonly lng: number;
};

export function isValidKoreanCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export function isGeocodeAccuracy(value: unknown): value is GeocodeAccuracy {
  return typeof value === "string" && (GEOCODE_ACCURACIES as readonly string[]).includes(value);
}

/**
 * 저장된 좌표를 지도에 바로 쓸 수 있나. 좌표를 구한 주소가 지금 주소와 같을 때만(주소가 바뀌었으면 다시 찾는다)
 * 쓰고, 근사(approx) 좌표는 쓰지 않는다(정확히 못 찾은 위치를 굳히지 않는다). 손으로 지정(manual)한 건 주소가 달라도 쓴다.
 */
export function usableStoredPoint(stored: { accuracy?: string | null; address?: string | null; lat?: number | null; lng?: number | null } | undefined, currentAddress: string): { lat: number; lng: number } | null {
  if (!stored || !isValidKoreanCoordinate(stored.lat, stored.lng ?? undefined) || !isGeocodeAccuracy(stored.accuracy)) return null;
  if (stored.accuracy === "approx") return null;
  if (stored.accuracy !== "manual" && (stored.address ?? "").trim() !== currentAddress.trim()) return null;
  return { lat: stored.lat as number, lng: stored.lng as number };
}
