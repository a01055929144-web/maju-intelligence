"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { PricingCommand } from "@/application/pricing/manage-price-sheets";

type Item = { id: string; code: string; name: string; spec: string; unit: string; category: string; suggestion: string };
const UNSORTED = "__none__";

/**
 * 11/4: 품목 그룹(카테고리) 정리 + 카테고리별 마진.
 * MAJU가 상품명으로 카테고리를 추천 → 사용자가 표에서 확인·수정 → 저장. 저장한 카테고리는 매입가를 다시 올려도 바뀌지 않습니다.
 * 카테고리마다 마진을 정하면 같은 이름의 마진 그룹을 만들어 연결합니다(우선순위: 직접 단가 → 개별 → 카테고리 → 기본).
 */
export function ProductCategoryManager({ busy, companyId, send, state, task }: {
  readonly busy: boolean;
  readonly companyId: string;
  readonly send: (command: PricingCommand) => Promise<PriceState>;
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

  const load = useCallback(async () => {
    const response = await fetch(`/api/price-sheets/categories?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "상품 목록을 불러오지 못했습니다.");
    setItems(body.items);
    setOptions((prev) => Array.from(new Set([...(body.options as string[]), ...prev])));
  }, [companyId]);
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다.")); }, [load]);

  const current = useCallback((item: Item) => draft[item.id] ?? item.category, [draft]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items || []) { const c = current(item) || UNSORTED; map.set(c, (map.get(c) || 0) + 1); }
    return map;
  }, [items, current]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter((item) => (!filter || (current(item) || UNSORTED) === filter) && (!q || `${item.code} ${item.name} ${item.spec}`.toLowerCase().includes(q)));
  }, [items, filter, search, current]);
  const PAGE = 100;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice((page - 1) * PAGE, page * PAGE);
  useEffect(() => { setPage(1); }, [filter, search]);

  const changed = (items || []).filter((item) => draft[item.id] !== undefined && draft[item.id] !== item.category);
  const unsorted = (items || []).filter((item) => !item.category);
  const suggestable = unsorted.filter((item) => item.suggestion && draft[item.id] === undefined);
  const groupOf = (category: string) => {
    const link = state.categories.find((c) => c.category === category);
    return state.groups.find((g) => g.id === link?.groupId);
  };

  function fillSuggestions() {
    setDraft((prev) => { const next = { ...prev }; for (const item of suggestable) next[item.id] = item.suggestion; return next; });
    setFilter("");
  }
  function applyMove() {
    const category = moveTo === "__new__" ? newCategory.trim() : moveTo;
    if (!category || !picked.size) return;
    if (!options.includes(category)) setOptions((prev) => [...prev, category]);
    setDraft((prev) => { const next = { ...prev }; picked.forEach((id) => { next[id] = category; }); return next; });
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
      await load();
      // 카테고리에 마진이 걸려 있으면 판매가도 바로 맞춥니다.
      const s = await send({ action: "recalculate" }).catch(() => null);
      void s;
    }, `${list.length}개 상품의 카테고리를 저장했습니다.`);
  }
  async function saveCategoryMargin(category: string) {
    const raw = margins[category];
    const margin = Number(raw);
    if (raw === undefined || raw === "" || !Number.isFinite(margin) || margin < 0 || margin > 1000) return;
    await task(async () => {
      let s = state;
      let group = s.groups.find((g) => g.name === category);
      s = await send(group ? { action: "group", id: group.id, name: category, margin, rounding: group.rounding } : { action: "group", name: category, margin, rounding: s.defaultRounding });
      group = s.groups.find((g) => g.name === category);
      if (!group) throw new Error("마진 그룹을 만들지 못했습니다.");
      if (!s.categories.some((c) => c.category === category && c.groupId === group!.id)) s = await send({ action: "category", category, groupId: group.id });
      if (s.pendingCount > 0) await send({ action: "recalculate" });
      setMargins((prev) => { const next = { ...prev }; delete next[category]; return next; });
    }, `${category} 마진을 ${margin}%로 정하고 판매가에 반영했습니다.`);
  }
  async function clearCategoryMargin(category: string) {
    await task(async () => {
      const s = await send({ action: "category", category, groupId: "" });
      if (s.pendingCount > 0) await send({ action: "recalculate" });
    }, `${category}은(는) 이제 기본 마진을 씁니다.`);
  }

  if (!items) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{error ? <p className="text-rose-700" role="alert">{error}</p> : "상품 카테고리를 불러오는 중…"}</section>;

  const categoryList = Array.from(new Set([...options, ...Array.from(counts.keys()).filter((c) => c !== UNSORTED)]));
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-xs font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">② 품목 그룹(카테고리)별 마진</h2>
          <p className="text-sm text-slate-600">농산·수산·정육처럼 묶어서 마진을 다르게 줍니다. MAJU가 상품명으로 추천하면 확인하고 저장하세요. 저장한 카테고리는 매입가를 다시 올려도 바뀌지 않습니다.</p>
        </div>
        {unsorted.length ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">미분류 {unsorted.length}개</span> : null}
      </div>

      {/* 카테고리별 마진 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">카테고리</th><th className="p-2 text-right">상품</th><th className="p-2">마진</th><th className="p-2" /></tr></thead>
          <tbody>
            {categoryList.map((category) => {
              const group = groupOf(category);
              const count = counts.get(category) || 0;
              return (
                <tr className="border-t" key={category}>
                  <td className="p-2"><button className={`font-bold ${filter === category ? "text-teal-700 underline" : ""}`} onClick={() => setFilter(filter === category ? "" : category)} type="button">{category}</button></td>
                  <td className="p-2 text-right">{count.toLocaleString()}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-1">
                      <input aria-label={`${category} 마진율`} className="h-8 w-20 rounded border border-slate-300 px-2 text-right" inputMode="decimal" onChange={(e) => setMargins((prev) => ({ ...prev, [category]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") void saveCategoryMargin(category); }} placeholder={group ? String(group.margin) : `${state.defaultMargin} (기본)`} value={margins[category] ?? ""} />%
                      {group ? <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-bold text-teal-800">{group.margin}% 적용 중</span> : <span className="text-[11px] text-slate-500">기본 마진</span>}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {margins[category] !== undefined && margins[category] !== "" ? <button className="rounded bg-teal-700 px-2.5 py-1 text-xs font-bold text-white" disabled={busy} onClick={() => void saveCategoryMargin(category)} type="button">저장</button> : null}
                    {group ? <button className="ml-1 text-xs text-slate-500 underline" disabled={busy} onClick={() => void clearCategoryMargin(category)} type="button">기본으로</button> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 카테고리 정리 */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={chip(!filter)} onClick={() => setFilter("")} type="button">전체 {items.length}</button>
          <button className={chip(filter === UNSORTED)} onClick={() => setFilter(filter === UNSORTED ? "" : UNSORTED)} type="button">미분류 {counts.get(UNSORTED) || 0}</button>
          {categoryList.map((c) => <button className={chip(filter === c)} key={c} onClick={() => setFilter(filter === c ? "" : c)} type="button">{c} {counts.get(c) || 0}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="카테고리 정리 상품 검색" className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setSearch(e.target.value)} placeholder="코드·상품명·규격 검색" value={search} />
          <button className="h-9 rounded-md bg-amber-500 px-3 text-sm font-black text-white disabled:bg-slate-300" disabled={!suggestable.length} onClick={fillSuggestions} type="button">MAJU 추천 채우기 ({suggestable.length})</button>
          <button className="h-9 rounded-md bg-teal-700 px-3 text-sm font-black text-white disabled:bg-slate-300" disabled={busy || !changed.length} onClick={() => void saveDraft()} type="button">확인하고 저장 ({changed.length})</button>
          {changed.length ? <button className="h-9 px-2 text-sm text-slate-500 underline" onClick={() => setDraft({})} type="button">되돌리기</button> : null}
        </div>
        {picked.size ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
            <strong>{picked.size}개 선택</strong> →
            <select aria-label="옮길 카테고리" className="h-8 rounded px-2 text-slate-900" onChange={(e) => setMoveTo(e.target.value)} value={moveTo}>
              <option value="">카테고리 선택</option>
              {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ 새 카테고리</option>
            </select>
            {moveTo === "__new__" ? <input aria-label="새 카테고리 이름" className="h-8 w-32 rounded px-2 text-slate-900" maxLength={30} onChange={(e) => setNewCategory(e.target.value)} placeholder="예: 베이커리" value={newCategory} /> : null}
            <button className="rounded bg-teal-500 px-2.5 py-1 font-bold disabled:opacity-50" disabled={!moveTo || (moveTo === "__new__" && !newCategory.trim())} onClick={applyMove} type="button">옮기기</button>
            <button className="ml-auto text-white/80" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
          </div>
        ) : null}
        <div className="max-h-[480px] overflow-auto rounded border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-8 p-2"><input aria-label="보이는 상품 전체 선택" checked={visible.length > 0 && visible.every((i) => picked.has(i.id))} onChange={(e) => setPicked(e.target.checked ? new Set(visible.map((i) => i.id)) : new Set())} type="checkbox" /></th>
                <th className="p-2">상품</th><th className="p-2">규격·단위</th><th className="p-2">카테고리</th><th className="p-2">MAJU 추천</th>
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
                      <select aria-label={`${item.name} 카테고리`} className={`h-8 rounded border px-1 text-sm ${pending ? "border-amber-400 font-bold" : "border-slate-300"}`} onChange={(e) => setDraft((prev) => ({ ...prev, [item.id]: e.target.value }))} value={value}>
                        <option value="">미분류</option>
                        {categoryList.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-xs">{item.suggestion ? (item.suggestion === value ? <span className="text-slate-400">{item.suggestion}</span> : <button className="font-bold text-amber-700 underline" onClick={() => setDraft((prev) => ({ ...prev, [item.id]: item.suggestion }))} type="button">{item.suggestion} 적용</button>) : <span className="text-slate-300">-</span>}</td>
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
