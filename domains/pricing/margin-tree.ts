import type { PriceItem, PriceState } from "./price-rules";

// CC-18: 분류(폴더) 트리와 폴더별 마진 표시. 순수 함수 — 화면은 이 결과만 그린다.
export type MarginTreeNode = {
  /** 화면용 경로("농산 > 채소류"). 저장 키는 아래 rawPathsInFolder가 돌려주는 원래 문자열을 쓴다. */
  path: string;
  name: string;
  depth: number;
  /** 이 폴더(하위 포함)의 활성 상품 수 */
  count: number;
  /** "15%" · "기본" · "혼합" · "직접" */
  badge: string;
  tone: "default" | "margin" | "mixed";
};

export const categoryParts = (category: string) => category.split(">").map((part) => part.trim()).filter(Boolean);
const joinParts = (parts: readonly string[]) => parts.join(" > ");

/** 이 상품에 실제로 적용되는 마진(직접 단가는 마진이 아니므로 null). 우선순위: 직접 단가 → 상품 → 그룹(상품 연결 → 분류 연결) → 기본. */
export function effectiveMargin(item: PriceItem, state: PriceState): { margin: number | null; kind: "direct" | "item" | "group" | "default" } {
  if (item.directPrice !== null) return { margin: null, kind: "direct" };
  if (item.itemMargin !== null) return { margin: item.itemMargin, kind: "item" };
  const group = state.groups.find((g) => g.id === item.groupId) ?? state.groups.find((g) => g.id === state.categories.find((c) => c.category === item.category)?.groupId);
  if (group) return { margin: group.margin, kind: "group" };
  return { margin: state.defaultMargin, kind: "default" };
}

/** folder가 null이면 전체. 폴더 경로의 각 단계가 같으면 하위 전부 포함. */
export function inFolder(category: string, folder: string | null) {
  if (!folder) return true;
  const want = categoryParts(folder), have = categoryParts(category);
  return want.length <= have.length && want.every((part, i) => have[i] === part);
}

/** 이 폴더(하위 포함 여부 선택)에 속한 원래 분류 문자열들 — 상품 분류와 마진 연결 양쪽에서 모은다. */
export function rawPathsInFolder(items: readonly PriceItem[], links: readonly { category: string }[], folder: string, withChildren: boolean) {
  const want = categoryParts(folder);
  const all = new Set<string>([...items.map((item) => item.category), ...links.map((link) => link.category)].filter((category) => category.trim()));
  return Array.from(all).filter((category) => {
    const have = categoryParts(category);
    return withChildren ? inFolder(category, folder) : have.length === want.length && inFolder(category, folder);
  }).sort((a, b) => a.localeCompare(b, "ko"));
}

export function buildMarginTree(items: readonly PriceItem[], state: PriceState): MarginTreeNode[] {
  const paths = new Set<string>();
  for (const item of items) {
    if (!item.active) continue;
    const parts = categoryParts(item.category);
    for (let depth = 1; depth <= parts.length; depth += 1) paths.add(joinParts(parts.slice(0, depth)));
  }
  return Array.from(paths).sort((a, b) => a.localeCompare(b, "ko")).map((path) => {
    const parts = categoryParts(path);
    const members = items.filter((item) => item.active && inFolder(item.category, path));
    const found = members.map((item) => effectiveMargin(item, state));
    const margins = new Set(found.filter((entry) => entry.margin !== null).map((entry) => entry.margin as number));
    const onlyDefault = found.length > 0 && found.every((entry) => entry.kind === "default");
    const onlyDirect = found.length > 0 && found.every((entry) => entry.kind === "direct");
    const single = margins.size === 1 ? Array.from(margins)[0] : null;
    const badge = onlyDirect ? "직접" : onlyDefault ? "기본" : single !== null && found.every((entry) => entry.margin !== null) ? `${single}%` : margins.size === 0 ? "기본" : "혼합";
    return { path, name: parts[parts.length - 1], depth: parts.length - 1, count: members.length, badge,
      tone: badge === "혼합" ? "mixed" : badge === "기본" || badge === "직접" ? "default" : "margin" } satisfies MarginTreeNode;
  });
}
