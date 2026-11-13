export type CommonColumnState = { key: string; hidden: boolean; pinned: boolean; width?: number; pct?: number };

/** 보기 개수 "전체"를 뜻하는 값. */
export const PAGE_SIZE_ALL = 0;
export const COMMON_TABLE_PAGE_SIZES = {
  list: [100, 500, 1000, PAGE_SIZE_ALL],
  order: [50, 100, 300, 500],
} as const;

export const COMMON_COLUMN_MIN_WIDTH = 80;
export const COMMON_COLUMN_MAX_WIDTH = 640;

export function clampColumnWidth(width: number) {
  return Math.min(COMMON_COLUMN_MAX_WIDTH, Math.max(COMMON_COLUMN_MIN_WIDTH, Math.round(width)));
}

/** 저장된 열 너비 하나를 바꾼다. 다른 열·순서는 그대로. */
export function setColumnWidth(state: CommonColumnState[], key: string, width: number) {
  return state.map((item) => (item.key === key ? { ...item, width: clampColumnWidth(width) } : item));
}

export function normalizeColumnState(columns: Array<{ key: string; defaultHidden?: boolean }>, saved?: CommonColumnState[]): CommonColumnState[] {
  const known = new Set(columns.map((column) => column.key));
  const state = (saved || [])
    .filter((item) => known.has(item.key))
    // 저장값이 깨졌거나(문자·NaN) 범위 밖이면 너비는 버리고 열 기본 너비를 쓴다.
    .map((item) => {
      const { width, pct, ...rest } = item;
      const next: CommonColumnState = typeof width === "number" && Number.isFinite(width) ? { ...rest, width: clampColumnWidth(width) } : rest;
      // CC-38: 너비는 비율(%)로 저장. 깨진 값은 버린다.
      return typeof pct === "number" && Number.isFinite(pct) && pct > 0 && pct <= 100 ? { ...next, pct } : next;
    });
  for (const column of columns) if (!state.some((item) => item.key === column.key)) state.push({ key: column.key, hidden: Boolean(column.defaultHidden), pinned: false });
  return state;
}

/** 저장된 보기 개수가 이 화면의 허용값일 때만 쓰고, 아니면 첫 값(기본). */
export function pickPageSize(sizes: readonly number[], saved: unknown) {
  return typeof saved === "number" && sizes.includes(saved) ? saved : sizes[0];
}

/**
 * 열이 화면보다 넓으면 중요도 낮은 열(priority 큰 수)부터 자동으로 숨긴다. priority가 없는 열은 절대 숨기지 않는다.
 * need = 열별 최소 너비. 반환: 숨길 열 key 목록.
 */
export function autoHiddenKeys(cols: Array<{ key: string; need: number; priority?: number }>, available: number) {
  const hidden: string[] = [];
  let total = cols.reduce((sum, col) => sum + col.need, 0);
  const candidates = cols.filter((col) => col.priority !== undefined).sort((a, b) => (b.priority! - a.priority!) || (cols.indexOf(b) - cols.indexOf(a)));
  for (const col of candidates) {
    if (total <= available) break;
    hidden.push(col.key); total -= col.need;
  }
  return hidden;
}

/** 줄 높이가 같을 때 화면에 보이는 줄 범위(앞뒤 overscan). scrollTop = 표 윗면이 화면 위에서 얼마나 올라갔는지. */
export function visibleRange(total: number, rowHeight: number, scrollTop: number, viewport: number, overscan = 12) {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(total, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { start: Math.min(first, total), end: Math.max(Math.min(first, total), last) };
}

/** 가상 스크롤을 켜는 줄 수(이하는 그냥 다 그린다). */
export const VIRTUAL_THRESHOLD = 200;

/** 검색어(공백 무시·대소문자 무시·일반 포함 검색)가 값 중 하나에 들어 있는가. */
export function matchesQuery(values: Array<string | number | null | undefined>, query: string) {
  const q = query.replace(/\s+/g, "").toLowerCase();
  return !q || values.some((value) => String(value ?? "").replace(/\s+/g, "").toLowerCase().includes(q));
}

/** 값별 줄 수(분류 칩 개수). order에 있는 값이 먼저, 나머지는 많은 순. 빈 값은 "기타". */
export function countByKey(keys: Array<string | null | undefined>, order: readonly string[] = []) {
  const counts = new Map<string, number>();
  for (const key of keys) { const k = key?.trim() || "기타"; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
  return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => rank(a.key) - rank(b.key) || b.count - a.count || a.key.localeCompare(b.key, "ko"));
}

/** CC-38: 열 너비 끌기 최소 폭(px). */
export const COMMON_COLUMN_DRAG_MIN_PX = 48;

/** 보이는 열들의 px 너비를 합 100인 비율(%)로 바꾼다(소수 2자리, 마지막 열이 나머지를 받아 합을 100으로 맞춤). */
export function pctsFromPx(widths: readonly number[]) {
  const total = widths.reduce((sum, w) => sum + Math.max(1, w), 0);
  const pcts = widths.map((w) => Math.round((Math.max(1, w) / total) * 10000) / 100);
  if (pcts.length) pcts[pcts.length - 1] = Math.round((100 - pcts.slice(0, -1).reduce((s, v) => s + v, 0)) * 100) / 100;
  return pcts;
}

/** 저장된 비율이 있는 열은 그 비율을 유지하고, 없는 열은 평균 몫을 받은 뒤 합이 100이 되게 다시 나눈다(열 숨김·표시 뒤 재분배). */
export function redistributePct(saved: ReadonlyArray<number | undefined>) {
  if (!saved.length) return [];
  const known = saved.filter((v): v is number => typeof v === "number" && v > 0);
  const fill = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 100 / saved.length;
  return pctsFromPx(saved.map((v) => (typeof v === "number" && v > 0 ? v : fill)));
}

/** 경계 index(왼쪽 열)를 deltaPct만큼 옮긴다: 왼쪽 열이 늘면 오른쪽 열이 그만큼 줄어 합은 그대로. 양쪽 모두 minPct 아래로 못 내려간다. */
export function dragBoundary(pcts: readonly number[], index: number, deltaPct: number, minPct: number) {
  if (index < 0 || index >= pcts.length - 1) return [...pcts];
  const pair = pcts[index] + pcts[index + 1];
  const left = Math.min(pair - minPct, Math.max(minPct, pcts[index] + deltaPct));
  const next = [...pcts];
  next[index] = Math.round(left * 100) / 100;
  next[index + 1] = Math.round((pair - next[index]) * 100) / 100;
  return next;
}

/** 번호 열 값: 걸러진·정렬된 순서의 1부터, 쪽 번호·쪽 크기 반영("전체"는 쪽 0). */
export const rowNumber = (page: number, pageSize: number, indexInPage: number) => (pageSize === PAGE_SIZE_ALL ? 0 : (page - 1) * pageSize) + indexInPage + 1;
