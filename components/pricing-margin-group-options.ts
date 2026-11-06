import type { PriceItem, PriceState, MarginCategory } from "../domains/pricing/price-rules";

/** 이 품목에 실제로 적용되는 규칙(직접 단가 → 품목 마진 → 그룹 → 기본). */
export function marginSource(item: PriceItem, state: PriceState) {
  if (item.directPrice !== null) return { kind: "direct" as const, label: "직접 단가", margin: null };
  if (item.itemMargin !== null) return { kind: "item" as const, label: "개별", margin: item.itemMargin };
  const group = state.groups.find((g) => g.id === item.groupId) || state.groups.find((g) => g.id === state.categories.find((c) => c.category === item.category)?.groupId);
  if (group) return { kind: "group" as const, label: group.name, margin: group.margin, groupId: group.id };
  return { kind: "default" as const, label: "기본", margin: state.defaultMargin };
}


export type MarginCategoryOption = { path: string; parts: string[]; count: number; selectable: boolean };
export function marginCategoryOptions(items: readonly PriceItem[], links: readonly MarginCategory[]): MarginCategoryOption[] {
  const counts = new Map<string, number>(links.map(link => [link.category, 0]));
  for (const item of items) if (item.active && item.category.trim()) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return Array.from(counts, ([path, count]) => ({ path, count, parts: path.split(">").map(part => part.trim()), selectable: path === path.trim() && path.length > 0 && path.length <= 100 })).sort((a, b) => a.path.localeCompare(b.path, "ko"));
}
export function filterMarginCategories(options: readonly MarginCategoryOption[], query: string, levels: readonly string[]) {
  const terms = query.toLocaleLowerCase("ko").trim().split(/\s+/).filter(Boolean);
  return options.filter(option => levels.every((value, i) => !value || option.parts[i] === value) && terms.every(term => option.path.toLocaleLowerCase("ko").includes(term)));
}
export function marginGroupSummary(state: PriceState, items: readonly PriceItem[], groupId: string, selected: readonly string[]) {
  const selectedSet = new Set(selected), target = groupId || "new-group-preview";
  const proposed: PriceState = { ...state, groups: state.groups.some(group => group.id === target) ? state.groups : [...state.groups, { id: target, name: "새 그룹", margin: 0, rounding: 10 }],
    categories: [...state.categories.filter(link => link.groupId !== target && !selectedSet.has(link.category)), ...selected.map(category => ({ category, groupId: target }))] };
  let groupProducts = 0, explicitProducts = 0;
  const active = items.filter(item => item.active);
  for (const item of active) {
    const source = marginSource(item, proposed);
    if (item.cost > 0 && source.kind === "group" && source.groupId === target) { groupProducts++; if (item.groupId === target) explicitProducts++; }
  }
  return { categoryProducts: active.filter(item => selectedSet.has(item.category)).length, groupProducts, explicitProducts };
}
