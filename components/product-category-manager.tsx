"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { PricingCommand } from "@/application/pricing/manage-price-sheets";
import { CATEGORY_SEP, categoryAncestors, cleanCategory, isUnder, splitCategory } from "@/domains/pricing/product-category";

type Item = { id: string; code: string; name: string; spec: string; unit: string; category: string; suggestion: string };
const UNSORTED = "__none__";
const OFF = " (사용 안 함)";

/** 경로 목록 → 트리(이름·경로·자식). */
function buildTree(paths: readonly string[]) {
  type Node = { name: string; path: string; children: Node[] };
  const root: Node[] = [];
  for (const path of paths) {
    let level = root;
    const parts = splitCategory(path);
    parts.forEach((part, i) => {
      const full = parts.slice(0, i + 1).join(CATEGORY_SEP);
      let node = level.find((x) => x.name === part);
      if (!node) { node = { name: part, path: full, children: [] }; level.push(node); }
      level = node.children;
    });
  }
  return root;
}

/**
 * 11/5: 품목 분류(대 > 중 > 소) 정리 + 분류별 마진.
 * MAJU가 상품명으로 분류를 추천 → 사용자가 표에서 확인·수정 → 저장. 저장한 분류는 매입가를 다시 올려도 바뀌지 않습니다.
 * 분류(대·중·소 어디든)에 마진을 정하면 같은 이름의 마진 그룹을 만들고, 그 아래 모든 상품에 연결합니다.
 * 더 아래 분류에 따로 마진이 있으면 그쪽이 우선입니다(예: 축산 10% 안에서 한우만 8%).
 */
export function ProductCategoryManager({ busy, companyId, send, state, task }: {
  readonly busy: boolean;
  readonly companyId: string;
  readonly send: (command?: PricingCommand) => Promise<PriceState>;
  readonly state: PriceState;
  readonly task: (work: () => Promise<void>, done: string) => Promise<void>;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [page, setPage] = useState(1);
  const [margins, setMargins] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyUsed, setOnlyUsed] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/price-sheets/categories?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "상품 목록을 불러오지 못했습니다.");
    setItems(body.items);
    setOptions((prev) => Array.from(new Set([...(body.options as string[]), ...prev])));
    return body.items as Item[];
  }, [companyId]);
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다.")); }, [load]);

  const current = useCallback((item: Item) => draft[item.id] ?? item.category, [draft]);
  const countUnder = useCallback((path: string) => (items || []).filter((item) => { const c = current(item); return c && isUnder(c, path); }).length, [items, current]);
  const unsortedCount = (items || []).filter((item) => !current(item)).length;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter((item) => {
      const c = current(item);
      const okFilter = !filter || (filter === UNSORTED ? !c : Boolean(c) && isUnder(c, filter));
      return okFilter && (!q || `${item.code} ${item.name} ${item.spec} ${c}`.toLowerCase().includes(q));
    });
  }, [items, filter, search, current]);
  const PAGE = 100;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => { setPage(1); }, [filter, search]);

  const changed = (items || []).filter((item) => draft[item.id] !== undefined && draft[item.id] !== item.category);
  const suggestable = (items || []).filter((item) => !item.category && item.suggestion && draft[item.id] === undefined);
  const usedPaths = useMemo(() => {
    const set = new Set<string>();
    for (const item of items || []) { const c = current(item); if (c) for (const a of categoryAncestors(c)) set.add(a); }
    return set;
  }, [items, current]);
  const allPaths = useMemo(() => Array.from(new Set([...options, ...Array.from(usedPaths)])), [options, usedPaths]);
  const tree = useMemo(() => buildTree(onlyUsed ? allPaths.filter((p) => usedPaths.has(p)) : allPaths), [allPaths, usedPaths, onlyUsed]);
  const groupFor = (path: string, s: PriceState = state) => s.groups.find((g) => g.name === path);

  /** 각 분류 값이 가장 가까운(가장 깊은) 분류 마진 그룹에 연결되도록 맞춥니다. */
  async function syncLinks(s: PriceState, values: readonly string[]) {
    const work: Array<{ category: string; groupId: string }> = [];
    for (const value of Array.from(new Set(values.filter(Boolean)))) {
      const ancestor = categoryAncestors(value).reverse().find((path) => groupFor(path, s));
      const desired = ancestor ? groupFor(ancestor, s)!.id : "";
      const link = s.categories.find((c) => c.category === value);
      const currentId = link?.groupId || "";
      if (currentId === desired) continue;
      const currentGroup = s.groups.find((g) => g.id === currentId);
      // 고급 화면에서 직접 연결한 다른 이름의 그룹은 건드리지 않습니다(분류 마진이 없을 때).
      if (!desired && currentGroup && !categoryAncestors(value).includes(currentGroup.name.replace(OFF, ""))) continue;
      work.push({ category: value, groupId: desired });
    }
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, work.length) }, async () => {
      while (cursor < work.length) { const next = work[cursor++]; await send({ action: "category", ...next }); }
    }));
    // The last completed POST can contain a stale count when other links commit concurrently.
    return work.length ? send() : s;
  }
  const allValues = (list: readonly Item[] = items || []) => list.map((item) => current(item)).filter(Boolean);

  function fillSuggestions() {
    setDraft((prev) => { const next = { ...prev }; for (const item of suggestable) next[item.id] = item.suggestion; return next; });
    setFilter("");
  }
  function applyMove() {
    const raw = moveTo === "__new__" ? newCategory : moveTo;
    const cleaned = cleanCategory(raw);
    if (!cleaned || typeof cleaned === "object" || !picked.size) { if (cleaned && typeof cleaned === "object") setError(cleaned.error); return; }
    if (!options.includes(cleaned)) setOptions((prev) => [...prev, cleaned]);
    setDraft((prev) => { const next = { ...prev }; picked.forEach((id) => { next[id] = cleaned; }); return next; });
    setPicked(new Set());
    setNewCategory("");
  }
  async function saveDraft() {
    const list = changed.map((item) => ({ id: item.id, category: draft[item.id] || null }));
    await task(async () => {
      for (let i = 0; i < list.length; i += 300) {
        const response = await fetch("/api/price-sheets/products", { body: JSON.stringify({ companyId, items: list.slice(i, i + 300) }), headers: { "Content-Type": "application/json" }, method: "PATCH" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.failed) throw new Error(body.message || `${body.failed || ""}개를 저장하지 못했습니다. 다시 시도해 주세요.`);
      }
      setDraft({});
      const fresh = await load();
      const s = await syncLinks(state, fresh.map((item) => item.category));
      if (s.pendingCount > 0) await send({ action: "recalculate" });
    }, `${list.length}개 상품의 분류를 저장했습니다.`);
  }
  async function saveMargin(path: string) {
    const raw = margins[path];
    const margin = Number(raw);
    if (raw === undefined || raw === "" || !Number.isFinite(margin) || margin < 0 || margin > 1000) return;
    await task(async () => {
      const existing = groupFor(path) || state.groups.find((g) => g.name === path + OFF);
      let s = await send(existing ? { action: "group", id: existing.id, name: path, margin, rounding: existing.rounding } : { action: "group", name: path, margin, rounding: state.defaultRounding });
      s = await syncLinks(s, allValues());
      if (s.pendingCount > 0) await send({ action: "recalculate" });
      setMargins((prev) => { const next = { ...prev }; delete next[path]; return next; });
    }, `${path.replace(/ > /g, "›")} 마진을 ${margin}%로 정하고 판매가에 반영했습니다.`);
  }
  async function clearMargin(path: string) {
    const group = groupFor(path);
    if (!group) return;
    await task(async () => {
      let s = await send({ action: "group", id: group.id, name: (path + OFF).slice(0, 80), margin: group.margin, rounding: group.rounding });
      s = await syncLinks(s, allValues());
      if (s.pendingCount > 0) await send({ action: "recalculate" });
    }, `${path}은(는) 이제 위 분류 또는 기본 마진을 씁니다.`);
  }

  if (!items) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{error ? <p className="text-rose-700" role="alert">{error}</p> : "상품 분류를 불러오는 중…"}</section>;

  const effectiveMargin = (path: string) => {
    const ancestor = categoryAncestors(path).reverse().find((p) => groupFor(p));
    return ancestor ? { margin: groupFor(ancestor)!.margin, from: ancestor } : { margin: state.defaultMargin, from: "" };
  };
  type TreeNode = ReturnType<typeof buildTree>[number];
  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const group = groupFor(node.path);
    const eff = effectiveMargin(node.path);
    const expanded = open.has(node.path);
    const count = countUnder(node.path);
    return (
      <div key={node.path}>
        <div className={`flex flex-wrap items-center gap-2 border-t py-1.5 text-sm ${filter === node.path ? "bg-teal-50" : ""}`} style={{ paddingLeft: 8 + depth * 20 }}>
          {node.children.length ? <button aria-label={`${node.name} ${expanded ? "접기" : "펼치기"}`} className="text-slate-500" onClick={() => setOpen((prev) => { const s = new Set(prev); if (s.has(node.path)) s.delete(node.path); else s.add(node.path); return s; })} type="button">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span className="w-4" />}
          <button className={`min-w-0 flex-1 truncate text-left ${depth === 0 ? "font-black" : depth === 1 ? "font-bold" : ""}`} onClick={() => setFilter(filter === node.path ? "" : node.path)} type="button">{node.name}</button>
          <span className="w-14 text-right text-xs text-slate-500">{count.toLocaleString()}개</span>
          <span className="flex items-center gap-1">
            <input aria-label={`${node.path} 마진율`} className="h-7 w-16 rounded border border-slate-300 px-1.5 text-right text-sm" inputMode="decimal" onChange={(e) => setMargins((prev) => ({ ...prev, [node.path]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void saveMargin(node.path); }} placeholder={String(eff.margin)} value={margins[node.path] ?? ""} />%
          </span>
          <span className="w-28 text-[11px]">
            {group ? <span className="rounded bg-teal-100 px-1.5 py-0.5 font-bold text-teal-800">{group.margin}% 지정</span> : eff.from ? <span className="text-slate-500">위 분류 {eff.margin}%</span> : <span className="text-slate-400">기본 {state.defaultMargin}%</span>}
          </span>
          <span className="w-20 text-right">
            {margins[node.path] ? <button className="rounded bg-teal-700 px-2 py-0.5 text-xs font-bold text-white" disabled={busy} onClick={() => void saveMargin(node.path)} type="button">저장</button> : group ? <button className="text-xs text-slate-500 underline" disabled={busy} onClick={() => void clearMargin(node.path)} type="button">지정 해제</button> : null}
          </span>
        </div>
        {expanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  };
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`;
  const optionLabel = (path: string) => { const parts = splitCategory(path); return `${"　".repeat(parts.length - 1)}${parts[parts.length - 1]}`; };
  const sortedOptions = buildTree(allPaths);
  const flat = (nodes: TreeNode[]): string[] => nodes.flatMap((node) => [node.path, ...flat(node.children)]);
  const selectPaths = flat(sortedOptions);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">② 품목 분류(대 › 중 › 소)별 마진</h2>
          <p className="text-sm text-slate-600">KAMIS·aT 부류를 참고한 분류입니다. 종합식자재는 대·중분류로, 축산·수산 전문은 소분류(부위 등)까지 내려가 마진을 다르게 줄 수 있습니다. 아래 분류에 따로 정한 마진이 위 분류보다 우선입니다.</p>
        </div>
        {unsortedCount ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">미분류 {unsortedCount}개</span> : null}
      </div>
      {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}

      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <strong className="text-slate-800">분류별 마진</strong>
          <label className="ml-auto flex items-center gap-1"><input checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} type="checkbox" />상품이 있는 분류만</label>
          <button className="underline" onClick={() => setOpen(new Set(allPaths))} type="button">모두 펼치기</button>
          <button className="underline" onClick={() => setOpen(new Set())} type="button">접기</button>
        </div>
        <div className="max-h-[420px] overflow-auto">
          {tree.length ? tree.map((node) => renderNode(node, 0)) : <p className="p-4 text-center text-sm text-slate-500">아직 분류된 상품이 없습니다. 아래에서 「MAJU 추천 채우기」로 시작하세요.</p>}
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={chip(!filter)} onClick={() => setFilter("")} type="button">전체 {items.length}</button>
          <button className={chip(filter === UNSORTED)} onClick={() => setFilter(filter === UNSORTED ? "" : UNSORTED)} type="button">미분류 {unsortedCount}</button>
          {sortedOptions.map((node) => <button className={chip(filter === node.path)} key={node.path} onClick={() => setFilter(filter === node.path ? "" : node.path)} type="button">{node.name} {countUnder(node.path)}</button>)}
          {filter && filter !== UNSORTED && splitCategory(filter).length > 1 ? <span className="text-xs text-teal-800">· {filter}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="분류 정리 상품 검색" className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setSearch(e.target.value)} placeholder="코드·상품명·규격·분류 검색" value={search} />
          <button className="h-9 rounded-md bg-amber-500 px-3 text-sm font-black text-white disabled:bg-slate-300" disabled={!suggestable.length} onClick={fillSuggestions} type="button">MAJU 추천 채우기 ({suggestable.length})</button>
          <button className="h-9 rounded-md bg-teal-700 px-3 text-sm font-black text-white disabled:bg-slate-300" disabled={busy || !changed.length} onClick={() => void saveDraft()} type="button">확인하고 저장 ({changed.length})</button>
          {changed.length ? <button className="h-9 px-2 text-sm text-slate-500 underline" onClick={() => setDraft({})} type="button">되돌리기</button> : null}
        </div>
        {picked.size ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
            <strong>{picked.size}개 선택</strong> →
            <select aria-label="옮길 분류" className="h-8 max-w-[260px] rounded px-2 text-slate-900" onChange={(e) => setMoveTo(e.target.value)} value={moveTo}>
              <option value="">분류 선택</option>
              {selectPaths.map((path) => <option key={path} value={path}>{optionLabel(path)}</option>)}
              <option value="__new__">+ 새 분류 직접 입력</option>
            </select>
            {moveTo === "__new__" ? <input aria-label="새 분류" className="h-8 w-56 rounded px-2 text-slate-900" maxLength={95} onChange={(e) => setNewCategory(e.target.value)} placeholder="예: 축산 > 우육 > 수입 척롤" value={newCategory} /> : null}
            <button className="rounded bg-teal-500 px-2.5 py-1 font-bold disabled:opacity-50" disabled={!moveTo || (moveTo === "__new__" && !newCategory.trim())} onClick={applyMove} type="button">옮기기</button>
            <button className="ml-auto text-white/80" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
          </div>
        ) : null}
        <div className="max-h-[480px] overflow-auto rounded border">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-8 p-2"><input aria-label="보이는 상품 전체 선택" checked={visible.length > 0 && visible.every((i) => picked.has(i.id))} onChange={(e) => setPicked(e.target.checked ? new Set(visible.map((i) => i.id)) : new Set())} type="checkbox" /></th>
                <th className="p-2">상품</th><th className="p-2">규격·단위</th><th className="p-2">분류</th><th className="p-2">MAJU 추천</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const value = current(item);
                const pending = draft[item.id] !== undefined && draft[item.id] !== item.category;
                return (
                  <tr className={`border-t ${pending ? "bg-amber-50" : picked.has(item.id) ? "bg-teal-50" : ""}`} key={item.id}>
                    <td className="p-2"><input aria-label={`${item.name} 선택`} checked={picked.has(item.id)} onChange={(e) => setPicked((prev) => { const s = new Set(prev); if (e.target.checked) s.add(item.id); else s.delete(item.id); return s; })} type="checkbox" /></td>
                    <td className="p-2"><span className="font-semibold">{item.name}</span>{item.code ? <span className="ml-1 text-[11px] text-slate-400">{item.code}</span> : null}</td>
                    <td className="p-2 text-xs text-slate-600">{item.spec} {item.unit}</td>
                    <td className="p-2">
                      <select aria-label={`${item.name} 분류`} className={`h-8 max-w-[240px] rounded border px-1 text-sm ${pending ? "border-amber-400 font-bold" : "border-slate-300"}`} onChange={(e) => setDraft((prev) => ({ ...prev, [item.id]: e.target.value }))} title={value} value={value}>
                        <option value="">미분류</option>
                        {selectPaths.map((path) => <option key={path} value={path}>{optionLabel(path)}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-xs">{item.suggestion ? (item.suggestion === value ? <span className="text-slate-400">같음</span> : <button className="text-left font-bold text-amber-700 underline" onClick={() => setDraft((prev) => ({ ...prev, [item.id]: item.suggestion }))} type="button">{item.suggestion.replace(/ > /g, " › ")} 적용</button>) : <span className="text-slate-300">-</span>}</td>
                  </tr>
                );
              })}
              {!visible.length ? <tr><td className="p-6 text-center text-slate-500" colSpan={5}>해당 상품이 없습니다.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button className="rounded border px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">이전</button>
          <span>{page}/{pages} · {shown.length}개</span>
          <button className="rounded border px-2 py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} type="button">다음</button>
          <span className="ml-auto text-slate-500">노란 줄 = 아직 저장 안 한 변경</span>
        </div>
      </div>
    </section>
  );
}
