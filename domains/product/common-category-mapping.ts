export type CategoryNode = { id: string; name: string; parentId: string; level: number };

export const UNMAPPED_COMMON_CATEGORY = "기타";

export function categoryPaths(rows: CategoryNode[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathFor = (row: CategoryNode, seen = new Set<string>()): string => {
    if (!row.parentId || seen.has(row.id)) return row.name;
    seen.add(row.id);
    const parent = byId.get(row.parentId);
    return parent ? `${pathFor(parent, seen)} > ${row.name}` : row.name;
  };
  return new Map(rows.map((row) => [row.id, pathFor(row)]));
}
