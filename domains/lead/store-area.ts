export const SQUARE_METERS_PER_PYEONG = 3.3058;
export const MAX_REASONABLE_STORE_AREA_SQM = 100_000;

export type StoreAreaRange = "lte10" | "lte20" | "lte30" | "gte30" | "10to100";

/**
 * 공공 인허가 원천의 소재지 면적은 ㎡ 단위로 취급합니다. 빈 문자열, 0/음수,
 * 숫자가 아닌 값과 명백한 이상치는 저장하지 않습니다.
 */
export function parseStoreAreaSqm(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const area = typeof normalized === "number" ? normalized : Number(normalized);
  if (!Number.isFinite(area) || area <= 0 || area > MAX_REASONABLE_STORE_AREA_SQM) return undefined;
  return Math.round(area * 100) / 100;
}

export function squareMetersToPyeong(squareMeters: number | null | undefined): number | undefined {
  const area = parseStoreAreaSqm(squareMeters);
  return area === undefined ? undefined : Math.round((area / SQUARE_METERS_PER_PYEONG) * 10) / 10;
}

export function formatStoreAreaPyeong(squareMeters: number | null | undefined): string | undefined {
  const pyeong = squareMetersToPyeong(squareMeters);
  return pyeong === undefined ? undefined : `${pyeong.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평`;
}

export function isStoreAreaInRange(squareMeters: number | null | undefined, range: StoreAreaRange): boolean {
  const area = parseStoreAreaSqm(squareMeters);
  if (area === undefined) return false;
  // 경계 판정은 표시용 0.1평 반올림 전에 수행해 9.96평/30.04평이 잘못 분류되지 않게 합니다.
  const pyeong = area / SQUARE_METERS_PER_PYEONG;
  if (range === "lte10") return pyeong <= 10;
  if (range === "lte20") return pyeong <= 20;
  if (range === "lte30") return pyeong <= 30;
  if (range === "gte30") return pyeong >= 30;
  return pyeong >= 10 && pyeong <= 100;
}
