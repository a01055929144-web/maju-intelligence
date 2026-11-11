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
