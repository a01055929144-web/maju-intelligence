export type CommonColumnState = { key: string; hidden: boolean; pinned: boolean; width?: number };

export const COMMON_TABLE_PAGE_SIZES = {
  list: [30, 50, 100],
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
