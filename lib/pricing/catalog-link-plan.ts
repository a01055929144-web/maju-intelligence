// CC-32d: 여러 매장의 카탈로그를 바꾸기 전에 확인창에 보여 줄 요약 — 어떤 카탈로그에서 몇 곳이 바뀌는지, 이미 같은 곳은 몇 곳인지.
export type CatalogLinkStore = { id: string; templateId: string | null };

export function summarizeCatalogChange(stores: readonly CatalogLinkStore[], selectedIds: readonly string[], targetId: string | null, nameOf: (templateId: string | null) => string) {
  const selected = new Set(selectedIds);
  const picked = stores.filter((store) => selected.has(store.id));
  const changing = picked.filter((store) => store.templateId !== targetId);
  const from = new Map<string, number>();
  for (const store of changing) from.set(nameOf(store.templateId), (from.get(nameOf(store.templateId)) ?? 0) + 1);
  return {
    total: picked.length,
    changing: changing.map((store) => store.id),
    unchanged: picked.length - changing.length,
    from: Array.from(from, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko")),
  };
}
