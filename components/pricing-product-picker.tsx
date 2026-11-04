"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogChoice, Promotion } from "@/domains/pricing/document";
import { filterIndex, type IndexItem } from "@/domains/pricing/catalog-filter";

const PAGE = 50;

/**
 * 11/4: 문서 보기 왼쪽 — 상품관리 상품을 표로 보고 골라 담습니다.
 * 통합 검색 + 상세 조건(코드·상품명·규격·단위)으로 바로 거르고(입력 즉시), 보이는 줄의 판매가만 불러옵니다.
 * '행사·임박' 탭에서는 진행 중인 행사·유효기간 임박 상품을 담습니다.
 */
export function PricingProductPicker({
  added,
  busy,
  companyId,
  loadPrices,
  manager,
  onAdd,
  onAddPromotion,
  onOpenLibrary,
  onRefreshPromotions,
  promotions
}: {
  readonly added: ReadonlySet<string>;
  readonly busy: boolean;
  readonly companyId: string;
  readonly loadPrices: (ids: string[]) => Promise<CatalogChoice[]>;
  readonly manager: boolean;
  readonly onAdd: (items: CatalogChoice[]) => void;
  readonly onAddPromotion: (promotion: Promotion) => void;
  readonly onOpenLibrary: () => void;
  readonly onRefreshPromotions: () => void;
  readonly promotions: readonly Promotion[];
}) {
  const [tab, setTab] = useState<"products" | "promotions">("products");
  const [index, setIndex] = useState<IndexItem[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState({ all: "", code: "", name: "", spec: "", unit: "" });
  const [detail, setDetail] = useState(false);
  const [page, setPage] = useState(1);
  const [prices, setPrices] = useState<Record<string, CatalogChoice>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    void fetch(`/api/pricing-documents/catalog-index?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then(async (r) => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.message || "상품 목록을 불러오지 못했습니다."); return body.items as IndexItem[]; })
      .then((items) => { if (alive) setIndex(items); })
      .catch((e) => { if (alive) { setIndex([]); setLoadError(e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다."); } });
    return () => { alive = false; };
  }, [companyId]);

  // 11/4: 단위 버튼은 지금 검색·조건에 맞는 상품들의 단위만(단위 조건 자체는 빼고 계산).
  const units = useMemo(() => {
    const count = new Map<string, number>();
    for (const item of filterIndex(index || [], { ...filters, unit: "" })) if (item.unit) count.set(item.unit, (count.get(item.unit) || 0) + 1);
    const list = Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (filters.unit && !count.has(filters.unit)) list.unshift([filters.unit, 0]);
    return list;
  }, [index, filters]);
  const filtered = useMemo(() => filterIndex(index || [], filters), [index, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const visible = filtered.slice((page - 1) * PAGE, page * PAGE);
  const visibleKey = visible.map((item) => item.id).join(",");

  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => {
    const missing = visibleKey ? visibleKey.split(",").filter((id) => !prices[id]) : [];
    if (!missing.length) return;
    let alive = true;
    void loadPrices(missing).then((items) => { if (alive) setPrices((prev) => { const next = { ...prev }; for (const item of items) next[item.id] = item; return next; }); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const chosen = visible.filter((item) => picked.has(item.id) && !added.has(item.id)).map((item) => prices[item.id]).filter((item): item is CatalogChoice => Boolean(item));
  const selectable = visible.filter((item) => !added.has(item.id));
  const tabClass = (on: boolean) => `flex-1 px-3 py-2 text-sm font-bold ${on ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500"}`;
  const filterInput = "h-8 min-w-0 rounded border border-slate-300 px-2 text-xs";
  const activeDetail = [filters.code, filters.name, filters.spec, filters.unit].filter(Boolean).length;

  function toggle(id: string, on: boolean) {
    setPicked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  }

  return (
    <aside aria-label="상품 목록" className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
      <div className="flex border-b border-slate-200" role="tablist">
        <button aria-selected={tab === "products"} className={tabClass(tab === "products")} onClick={() => setTab("products")} role="tab" type="button">상품 {index ? index.length.toLocaleString() : ""}</button>
        <button aria-selected={tab === "promotions"} className={tabClass(tab === "promotions")} onClick={() => setTab("promotions")} role="tab" type="button">행사·임박 {promotions.length || ""}</button>
      </div>
      {tab === "products" ? (
        <>
          <div className="space-y-1.5 p-2">
            <div className="flex gap-1.5">
              <input aria-label="추가할 품목 검색" className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" maxLength={100} onChange={(e) => setFilter("all", e.target.value)} placeholder="코드·상품명·규격·단위 한 번에 찾기" value={filters.all} />
              <button aria-expanded={detail} className={`h-9 shrink-0 rounded-md border px-2 text-xs font-bold ${detail || activeDetail ? "border-teal-600 text-teal-800" : "border-slate-300"}`} onClick={() => setDetail((v) => !v)} type="button">상세{activeDetail ? ` ${activeDetail}` : ""}</button>
            </div>
            {detail ? (
              <div className="grid grid-cols-2 gap-1.5">
                <input aria-label="상품 코드로 거르기" className={filterInput} onChange={(e) => setFilter("code", e.target.value)} placeholder="상품 코드" value={filters.code} />
                <input aria-label="상품명으로 거르기" className={filterInput} onChange={(e) => setFilter("name", e.target.value)} placeholder="상품명" value={filters.name} />
                <input aria-label="규격으로 거르기" className={filterInput} onChange={(e) => setFilter("spec", e.target.value)} placeholder="규격 (예: 1kg)" value={filters.spec} />
                <button className="h-8 rounded border border-slate-300 text-xs" onClick={() => setFilters({ all: "", code: "", name: "", spec: "", unit: "" })} type="button">조건 지우기</button>
              </div>
            ) : null}
            {units.length ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label="단위로 거르기">
                {units.map(([unit, count]) => <button aria-pressed={filters.unit === unit} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${filters.unit === unit ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`} key={unit} onClick={() => setFilter("unit", filters.unit === unit ? "" : unit)} type="button">{unit} {count}</button>)}
              </div>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="w-7 p-1.5"><input aria-label="보이는 상품 전체 선택" checked={selectable.length > 0 && selectable.every((item) => picked.has(item.id))} onChange={(e) => setPicked(e.target.checked ? new Set(selectable.map((item) => item.id)) : new Set())} type="checkbox" /></th>
                  <th className="p-1.5">상품명</th>
                  <th className="w-16 p-1.5">규격</th>
                  <th className="w-16 p-1.5 text-right">판매가</th>
                  <th className="w-9 p-1.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const inDoc = added.has(item.id);
                  const price = prices[item.id];
                  const label = item.displayName || item.name;
                  return (
                    <tr className={`border-t border-slate-100 ${inDoc ? "bg-slate-50 text-slate-400" : picked.has(item.id) ? "bg-teal-50" : ""}`} key={item.id}>
                      <td className="p-1.5"><input aria-label={`${label} 선택`} checked={inDoc || picked.has(item.id)} disabled={inDoc} onChange={(e) => toggle(item.id, e.target.checked)} type="checkbox" /></td>
                      <td className="p-1.5">
                        <span className="block truncate font-semibold" title={label}>{label}</span>
                        {item.code ? <span className="text-[10px] text-slate-400">{item.code}</span> : null}
                        {price?.taxType === "unknown" ? <span className="ml-1 text-[10px] font-bold text-amber-700">과세 확인 필요</span> : null}
                      </td>
                      <td className="truncate p-1.5" title={`${item.spec} ${item.unit}`}>{item.spec} {item.unit}</td>
                      <td className="p-1.5 text-right font-bold">{price ? price.price.toLocaleString() : "…"}</td>
                      <td className="p-1.5 text-right">{inDoc ? <span className="text-[10px] font-bold">담김</span> : <button aria-label={`${label} 담기`} className="rounded bg-teal-700 px-1.5 py-0.5 font-bold text-white disabled:bg-slate-300" disabled={busy || !price} onClick={() => price && onAdd([price])} type="button">+</button>}</td>
                    </tr>
                  );
                })}
                {index === null ? <tr><td className="p-4 text-center text-slate-500" colSpan={5}>상품 목록을 불러오는 중입니다.</td></tr> : !visible.length ? <tr><td className="p-4 text-center text-slate-500" colSpan={5}>{loadError || "조건에 맞는 상품이 없습니다."}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 p-2 text-xs">
            <button className="rounded border border-slate-300 px-2 py-1 font-bold" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">이전</button>
            <span>{page}/{pages} · {filtered.length.toLocaleString()}개</span>
            <button className="rounded border border-slate-300 px-2 py-1 font-bold" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} type="button">다음</button>
            <button className="ml-auto rounded bg-teal-700 px-3 py-1.5 font-bold text-white disabled:bg-slate-300" disabled={busy || !chosen.length} onClick={() => { onAdd(chosen); setPicked(new Set()); }} type="button">선택 {chosen.length}개 담기</button>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
          {promotions.length ? promotions.map((p) => (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs" key={p.id}>
              <span className="rounded bg-amber-200 px-1 font-bold text-amber-900">{p.badge}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{p.displayName}</span>
                <span className="text-amber-900">{p.price.toLocaleString()}원 · {p.endsOn}까지{p.stock !== null ? ` · 재고 ${p.stock}` : ""}</span>
              </span>
              {added.has(`promo:${p.id}`) ? <span className="font-bold text-slate-500">담김</span> : <button className="rounded bg-amber-600 px-2 py-1 font-bold text-white" disabled={busy} onClick={() => onAddPromotion(p)} type="button">담기</button>}
            </div>
          )) : <p className="p-3 text-center text-xs text-slate-500">진행 중인 행사·임박 상품이 없습니다.</p>}
          <div className="flex gap-1.5">
            <button className="flex-1 rounded-lg border border-dashed border-amber-400 py-2 text-xs font-bold text-amber-900" onClick={onOpenLibrary} type="button">+ 행사·임박 상품 등록 (새 탭)</button>
            <button className="rounded-lg border border-slate-300 px-2 text-xs font-bold" disabled={busy} onClick={onRefreshPromotions} type="button">새로고침</button>
          </div>
        </div>
      )}
    </aside>
  );
}
