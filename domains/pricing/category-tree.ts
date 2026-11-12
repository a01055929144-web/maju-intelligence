import { splitCategory } from "./product-category";

// CC-26: 분류(폴더) 정렬은 이 함수 하나만 쓴다. 화면마다 따로 정렬하지 않는다.
// folderOrder = product_category_folders의 경로 → 같은 상위 안 순서(sort_order). 순서가 없는 폴더는 같은 상위 안 맨 뒤, 이름순.
export type FolderOrder = ReadonlyMap<string, number>;

const UNORDERED = Number.MAX_SAFE_INTEGER;

/** DB 행(경로·순서)에서 FolderOrder를 만든다. 경로는 공백·구분자를 정리해 같은 모양으로 맞춘다. */
export function toFolderOrder(rows: ReadonlyArray<{ path: string; sortOrder: number }>): FolderOrder {
  return new Map(rows.map((row) => [splitCategory(row.path).join(" > "), row.sortOrder]));
}

/** 두 분류 경로를 비교한다: 위에서부터 단계마다 폴더 순서 → 순서 없음은 뒤로 → 이름순. 상위 폴더가 하위보다 앞. */
export function compareCategoryPath(a: string, b: string, folderOrder: FolderOrder = new Map()): number {
  const x = splitCategory(a), y = splitCategory(b);
  for (let depth = 0; depth < Math.min(x.length, y.length); depth += 1) {
    if (x[depth] === y[depth]) continue;
    const ox = folderOrder.get(x.slice(0, depth + 1).join(" > ")) ?? UNORDERED;
    const oy = folderOrder.get(y.slice(0, depth + 1).join(" > ")) ?? UNORDERED;
    if (ox !== oy) return ox < oy ? -1 : 1;
    return x[depth].localeCompare(y[depth], "ko");
  }
  return x.length - y.length;
}

/** 경로 목록을 폴더 순서대로 정렬한 새 배열. */
export function sortCategoryPaths<T extends string>(paths: readonly T[], folderOrder?: FolderOrder): T[] {
  return [...paths].sort((a, b) => compareCategoryPath(a, b, folderOrder));
}

export type FolderNode = { path: string; name: string; depth: number; count: number };

/** 상품 분류 목록 → 폴더 트리(폴더 순서대로, 상위 폴더 바로 아래에 하위). count는 하위 폴더 상품 포함. 분류 없는 상품은 트리에 넣지 않는다. */
export function buildFolderTree(categories: readonly string[], folderOrder?: FolderOrder): FolderNode[] {
  const counts = new Map<string, number>();
  for (const category of categories) {
    const parts = splitCategory(category);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const path = parts.slice(0, depth).join(" > ");
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return sortCategoryPaths(Array.from(counts.keys()), folderOrder).map((path) => {
    const parts = splitCategory(path);
    return { path, name: parts[parts.length - 1], depth: parts.length - 1, count: counts.get(path) as number };
  });
}

/** 상품을 폴더 순서대로(같은 폴더 안은 기존 순서 그대로, 분류 없는 상품은 맨 뒤). */
export function orderByFolder<T extends { category?: string }>(items: readonly T[], folderOrder?: FolderOrder): T[] {
  return [...items].sort((a, b) => {
    const x = a.category?.trim() ?? "", y = b.category?.trim() ?? "";
    if (!x || !y) return x === y ? 0 : x ? -1 : 1;
    return compareCategoryPath(x, y, folderOrder);
  });
}
