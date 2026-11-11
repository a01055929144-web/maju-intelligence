"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceItem, PriceState } from "@/domains/pricing/price-rules";
import { calculatePrice } from "@/domains/pricing/price-rules";
import type { PricingBulkCommand, PricingCommand } from "@/application/pricing/manage-price-sheets";


import { PricingMarginTemplates } from "./pricing-margin-templates";
import { PricingFolderMargin } from "./pricing-folder-margin";
import { PricingSheetFromPrices } from "./pricing-sheet-from-prices";
import { PricingMarginGroups } from "./pricing-margin-groups";
import { PricingSalesPriceTable } from "./pricing-sales-price-table";
import { fetchAllPriceItems } from "@/lib/pricing/fetch-all-price-items";
import { buildMarginTree } from "@/domains/pricing/margin-tree";
import { toFolderOrder, type FolderOrder } from "@/domains/pricing/category-tree";
export { marginSource } from "./pricing-margin-group-options";

const box = "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm";

/**
 * 11/4 마진 설정 단순화.
 * ① 기본 마진 하나만 정하면 모든 상품 판매가가 매입가 × (1+마진)으로 바로 계산됩니다.
 * ② 카테고리별 마진은 기존 그룹과 분류 연결을 카드에서 고릅니다.
 * ③ 다른 마진을 줄 상품만 표에서 골라 한 번에 바꿉니다(개별 마진 · 직접 단가).
 */
export function PriceSheetsWorkspace({ companyId, marginTemplates = false }: { companyId: string; marginTemplates?: boolean }) {
  const [state, setState] = useState<PriceState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const search = "", page = 1; // 판매가 탭은 전체 상품을 한 번에 읽는다(서버 쪽 검색·쪽 나누기는 쓰지 않음)
  const [defaultMargin, setDefaultMargin] = useState("");
  const [defaultRounding, setDefaultRounding] = useState("10");
  const [showDefault, setShowDefault] = useState(false);
  // CC-30a: 표 하나에 전체 상품. 바꿀 때마다(version) 다시 읽는다. 못 읽으면 첫 쪽만으로 계속.
  const [allItems, setAllItems] = useState<PriceItem[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { void fetchAllPriceItems(companyId).then(setAllItems).catch(() => setAllItems(null)); }, [companyId, version]);
  const [folder, setFolder] = useState<string | null>(null);
  // CC-26: 폴더 순서(상품관리와 같은 순서). 읽지 못하면 이름순으로 계속 보여 준다.
  const [folderOrder, setFolderOrder] = useState<FolderOrder>(new Map());
  useEffect(() => {
    void fetch(`/api/price-sheets/folder-order?${new URLSearchParams({ companyId })}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { folders: [] }))
      .then((body: { folders?: Array<{ path: string; sortOrder: number }> }) => setFolderOrder(toFolderOrder(body.folders ?? [])))
      .catch(() => setFolderOrder(new Map()));
  }, [companyId]);

  const send = useCallback(async (command?: PricingCommand | PricingBulkCommand) => {
    const query = new URLSearchParams({ companyId, q: search, page: String(page) });
    const response = await fetch(`/api/price-sheets?${query}`, command ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) } : { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "불러오지 못했습니다.");
    setState(body as PriceState);
    return body as PriceState;
  }, [companyId, search, page]);

  /** 바꾼 뒤에는 판매가에 바로 반영(다시 계산)까지 한 번에. */
  const run = useCallback(async (commands: Array<PricingCommand | PricingBulkCommand>, done: string, apply = true) => {
    setBusy(true); setError(""); setMessage("");
    try {
      let last: PriceState | null = null;
      for (const command of commands) last = await send(command);
      if (apply && last && last.pendingCount > 0) last = await send({ action: "recalculate" });
      setMessage(done);
    } catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); }
    finally { setBusy(false); setVersion((v) => v + 1); }
  }, [send]);

  useEffect(() => {
    setBusy(true);
    void send().then((s) => { setDefaultMargin(String(s.defaultMargin)); setDefaultRounding(String(s.defaultRounding)); }).catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다.")).finally(() => setBusy(false));
  }, [send]);

  const sample = useMemo(() => {
    const margin = Number(defaultMargin);
    const rounding = Number(defaultRounding);
    if (!Number.isFinite(margin) || margin < 0) return null;
    try { return { cost: 10000, price: calculatePrice(10000, margin, rounding) }; } catch { return null; }
  }, [defaultMargin, defaultRounding]);

  if (!state) return <div className="space-y-3">{error ? <p className="text-red-700" role="alert">{error}</p> : <p role="status">불러오는 중…</p>}</div>;

  const zeroMargin = state.defaultMargin === 0;
  return <div className="space-y-4" aria-busy={busy}>
    {error && <p role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}

    {marginTemplates ? <PricingMarginTemplates companyId={companyId} state={state} /> : null}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold">기본 마진 {state.defaultMargin}% · {state.defaultRounding}원 올림 <button className="ml-2 rounded border border-slate-300 px-2 py-1 text-xs font-bold" onClick={() => setShowDefault((v) => !v)} type="button">{showDefault ? "닫기" : "바꾸기"}</button></p>
      <PricingSheetFromPrices busy={busy} companyId={companyId} folder={folder} />
    </div>
    {state.pendingCount > 0 || (state.lastBatch && !state.restored) ? <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>판매가에 아직 반영 안 된 변경 {state.pendingCount}개</span>
      <button className={box} disabled={busy || !state.pendingCount} onClick={() => void run([{ action: "recalculate" }], "판매가에 반영했습니다.", false)} type="button">지금 반영</button>
      <button className={box} disabled={busy || !state.lastBatch || state.restored} onClick={() => { if (state.lastBatch) void run([{ action: "restore", batchId: state.lastBatch }], "직전 반영을 되돌렸습니다.", false); }} type="button">직전 반영 되돌리기</button>
    </div> : null}
    {/* ① 기본 마진 */}
    <section aria-label="회사 기본 마진" className={`rounded-xl border p-4 ${zeroMargin ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-slate-600">모든 상품의 판매가 = 매입가 × (1 + 기본 마진). 단가표·견적서·주문 링크가 이 판매가를 씁니다.</p>
          {zeroMargin ? <p className="mt-1 text-sm font-bold text-amber-900">지금 기본 마진이 0%라 판매가가 매입가와 같습니다. 먼저 기본 마진을 정해 주세요.</p> : null}
        </div>
      </div>
      {showDefault || zeroMargin ? <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run([{ action: "defaults", margin: Number(defaultMargin), rounding: Number(defaultRounding) }], `기본 마진 ${defaultMargin}%를 저장하고 판매가에 반영했습니다.`); }}>
        <label className="text-sm font-bold">기본 마진
          <span className="mt-1 flex items-center gap-1"><input aria-label="기본 마진율" className={`${box} w-24 text-right text-lg font-black`} inputMode="decimal" max="1000" min="0" onChange={(e) => setDefaultMargin(e.target.value)} required step="0.01" type="number" value={defaultMargin} /><span className="text-lg font-black">%</span></span>
        </label>
        <label className="text-sm font-bold">끝자리 올림
          <select className={`${box} mt-1 block`} onChange={(e) => setDefaultRounding(e.target.value)} value={defaultRounding}>{[1, 10, 100].map((n) => <option key={n} value={n}>{n}원 단위</option>)}</select>
        </label>
        <div className="flex flex-wrap gap-1.5">{[5, 10, 15, 20, 25, 30].map((n) => <button className={`rounded-full px-3 py-1.5 text-sm font-bold ${Number(defaultMargin) === n ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={n} onClick={() => setDefaultMargin(String(n))} type="button">{n}%</button>)}</div>
        <button className="h-10 rounded-md bg-teal-700 px-4 text-sm font-black text-white disabled:bg-slate-300" disabled={busy || defaultMargin === ""} type="submit">저장하고 판매가 반영</button>
      </form> : null}
      {(showDefault || zeroMargin) && sample ? <p className="mt-2 text-sm text-slate-700">예시: 매입가 <strong>{sample.cost.toLocaleString()}원</strong> → 판매가 <strong className="text-teal-800">{sample.price.toLocaleString()}원</strong> (이익 {(sample.price - sample.cost).toLocaleString()}원)</p> : null}
    </section>

    <PricingSalesPriceTable busy={busy} folder={folder} folderTools={folder ? <PricingFolderMargin busy={busy} companyId={companyId} folder={folder} key={`margin-${folder}`} onBusy={setBusy} onError={setError} onMessage={setMessage} send={send} state={state} /> : null} items={allItems ?? state.items} onFolder={setFolder} run={run} state={state} tree={buildMarginTree(allItems ?? state.items, state, folderOrder)} />
    {allItems === null ? <p className="text-xs text-slate-500">전체 상품을 읽지 못해 이 페이지({state.items.length}개)만 보여 줍니다.</p> : null}
    <details className="rounded-xl border border-slate-200 bg-white p-3" data-testid="margin-advanced">
      <summary className="cursor-pointer text-sm font-bold">고급: 마진 그룹 직접 관리</summary>
      <div className="mt-3"><PricingMarginGroups companyId={companyId} state={state} busy={busy} send={send} onBusy={setBusy} onMessage={setMessage} onError={setError} /></div>
    </details>
  </div>;
}
