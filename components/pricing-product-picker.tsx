"use client";

import { useState } from "react";
import type { CatalogChoice, Promotion } from "@/domains/pricing/document";

/**
 * 11/4: 문서 보기 왼쪽 — 상품관리의 상품 목록을 표로 보고 골라 담습니다(뱃지 나열 대신).
 * '행사·임박' 탭에서는 진행 중인 행사·유효기간 임박 상품을 담습니다.
 */
export function PricingProductPicker({
  added,
  busy,
  catalog,
  catalogInput,
  catalogPage,
  catalogTotal,
  manager,
  onAdd,
  onAddPromotion,
  onOpenLibrary,
  onRefreshPromotions,
  onPage,
  onSearch,
  promotions,
  setCatalogInput
}: {
  readonly added: ReadonlySet<string>;
  readonly busy: boolean;
  readonly catalog: readonly CatalogChoice[];
  readonly catalogInput: string;
  readonly catalogPage: number;
  readonly catalogTotal: number;
  readonly manager: boolean;
  readonly onAdd: (items: CatalogChoice[]) => void;
  readonly onAddPromotion: (promotion: Promotion) => void;
  readonly onOpenLibrary: () => void;
  readonly onRefreshPromotions: () => void;
  readonly onPage: (page: number) => void;
  readonly onSearch: () => void;
  readonly promotions: readonly Promotion[];
  readonly setCatalogInput: (value: string) => void;
}) {
  const [tab, setTab] = useState<"products" | "promotions">("products");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pages = Math.max(1, Math.ceil(catalogTotal / 50));
  const selectable = catalog.filter((item) => !added.has(item.id));
  const chosen = catalog.filter((item) => picked.has(item.id) && !added.has(item.id));
  const tabClass = (on: boolean) => `flex-1 px-3 py-2 text-sm font-bold ${on ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500"}`;

  function toggle(id: string, on: boolean) {
    setPicked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  }

  return (
    <aside aria-label="상품 목록" className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
      <div className="flex border-b border-slate-200" role="tablist">
        <button aria-selected={tab === "products"} className={tabClass(tab === "products")} onClick={() => setTab("products")} role="tab" type="button">상품 {catalogTotal ? catalogTotal.toLocaleString() : ""}</button>
        <button aria-selected={tab === "promotions"} className={tabClass(tab === "promotions")} onClick={() => setTab("promotions")} role="tab" type="button">행사·임박 {promotions.length || ""}</button>
      </div>
      {tab === "products" ? (
        <>
          <form className="flex gap-1.5 p-2" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
            <input aria-label="추가할 품목 검색" className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm" maxLength={100} onChange={(e) => setCatalogInput(e.target.value)} placeholder={manager ? "상품명 검색" : "노출 상품명 검색"} value={catalogInput} />
            <button className="h-9 rounded-md border border-slate-300 px-2.5 text-sm font-bold" disabled={busy} type="submit">찾기</button>
          </form>
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
                {catalog.map((item) => {
                  const inDoc = added.has(item.id);
                  return (
                    <tr className={`border-t border-slate-100 ${inDoc ? "bg-slate-50 text-slate-400" : picked.has(item.id) ? "bg-teal-50" : ""}`} key={item.id}>
                      <td className="p-1.5"><input aria-label={`${item.displayName || item.name} 선택`} checked={inDoc || picked.has(item.id)} disabled={inDoc} onChange={(e) => toggle(item.id, e.target.checked)} type="checkbox" /></td>
                      <td className="p-1.5">
                        <span className="block truncate font-semibold" title={item.displayName || item.name}>{item.displayName || item.name}</span>
                        {item.taxType === "unknown" ? <span className="text-[10px] font-bold text-amber-700">과세 확인 필요</span> : null}
                      </td>
                      <td className="truncate p-1.5" title={`${item.spec} ${item.unit}`}>{item.spec} {item.unit}</td>
                      <td className="p-1.5 text-right font-bold">{item.price.toLocaleString()}</td>
                      <td className="p-1.5 text-right">{inDoc ? <span className="text-[10px] font-bold">담김</span> : <button aria-label={`${item.displayName || item.name} 담기`} className="rounded bg-teal-700 px-1.5 py-0.5 font-bold text-white" disabled={busy} onClick={() => onAdd([item])} type="button">+</button>}</td>
                    </tr>
                  );
                })}
                {!catalog.length ? <tr><td className="p-4 text-center text-slate-500" colSpan={5}>찾는 상품이 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 p-2 text-xs">
            <button className="rounded border border-slate-300 px-2 py-1 font-bold" disabled={busy || catalogPage <= 1} onClick={() => onPage(catalogPage - 1)} type="button">이전</button>
            <span>{catalogPage}/{pages}</span>
            <button className="rounded border border-slate-300 px-2 py-1 font-bold" disabled={busy || catalogPage >= pages} onClick={() => onPage(catalogPage + 1)} type="button">다음</button>
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
