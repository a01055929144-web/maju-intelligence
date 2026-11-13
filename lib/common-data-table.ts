export type CommonColumnState = { key: string; hidden: boolean; pinned: boolean; width?: number };

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
      const { width, ...rest } = item;
      return typeof width === "number" && Number.isFinite(width) ? { ...rest, width: clampColumnWidth(width) } : rest;
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
