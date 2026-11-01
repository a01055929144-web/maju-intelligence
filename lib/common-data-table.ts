export type CommonColumnState = { key: string; hidden: boolean; pinned: boolean };

export const COMMON_TABLE_PAGE_SIZES = {
  list: [30, 50, 100],
  order: [50, 100, 300, 500],
} as const;

export function normalizeColumnState(columns: Array<{ key: string; defaultHidden?: boolean }>, saved?: CommonColumnState[]) {
  const known = new Set(columns.map((column) => column.key));
  const state = (saved || []).filter((item) => known.has(item.key));
  for (const column of columns) if (!state.some((item) => item.key === column.key)) state.push({ key: column.key, hidden: Boolean(column.defaultHidden), pinned: false });
  return state;
}
