export const SQUARE_METERS_PER_PYEONG = 3.3058;
export const MAX_REASONABLE_STORE_AREA_SQM = 100_000;

export type StoreAreaRange = "lte10" | "lte20" | "lte30" | "gte30" | "10to100";

export type StoreAreaSqmFilterBounds = {
  max?: number;
  min?: number;
};

function pyeongBoundaryToStoredSqm(pyeong: number) {
  return Math.round(pyeong * SQUARE_METERS_PER_PYEONG * 100) / 100;
}

export function isStoreAreaRange(value: unknown): value is StoreAreaRange {
  return value === "lte10" || value === "lte20" || value === "lte30" || value === "gte30" || value === "10to100";
}

export function getStoreAreaSqmFilterBounds(range: StoreAreaRange): StoreAreaSqmFilterBounds {
  if (range === "lte10") return { max: pyeongBoundaryToStoredSqm(10) };
  if (range === "lte20") return { max: pyeongBoundaryToStoredSqm(20) };
  if (range === "lte30") return { max: pyeongBoundaryToStoredSqm(30) };
  if (range === "gte30") return { min: pyeongBoundaryToStoredSqm(30) };
  return { min: pyeongBoundaryToStoredSqm(10), max: pyeongBoundaryToStoredSqm(100) };
}

/**
 * PostgREST bulk INSERT는 모든 객체의 키 집합이 같아야 합니다. INSERT에서는 값이
 * 없어도 null 키를 만들고, 기존 행 PATCH에서는 원천에 값이 있을 때만 덮어씁니다.
 */
export function storeAreaWriteFields(
  storeAreaSqm: number | undefined,
  mode: "insert" | "update",
  enabled: boolean
): Record<string, number | null> {
  if (!enabled) return {};
  if (mode === "insert") return { store_area_sqm: storeAreaSqm ?? null };
  return storeAreaSqm === undefined ? {} : { store_area_sqm: storeAreaSqm };
}

export function mergePendingInsertStoreArea(
  currentStoreAreaSqm: unknown,
  incomingStoreAreaSqm: number | undefined
): number | null {
  return typeof currentStoreAreaSqm === "number" ? currentStoreAreaSqm : incomingStoreAreaSqm ?? null;
}

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
  // DB numeric(12,2)와 같은 0.01㎡ 정밀도의 임계값을 사용합니다. 표시용 평 반올림은
  // 판정에 쓰지 않으며, 정확히 10평인 33.058㎡가 33.06㎡로 저장돼도 경계 안에 남습니다.
  const bounds = getStoreAreaSqmFilterBounds(range);
  return (bounds.min === undefined || area >= bounds.min) && (bounds.max === undefined || area <= bounds.max);
}
