"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceItem, PriceState } from "@/domains/pricing/price-rules";
import { calculatePrice } from "@/domains/pricing/price-rules";
import type { PricingBulkCommand, PricingCommand } from "@/application/pricing/manage-price-sheets";


import { marginSource } from "./pricing-margin-group-options";
import { PricingMarginTemplates } from "./pricing-margin-templates";
import { PricingFolderMargin } from "./pricing-folder-margin";
import { PricingSheetFromPrices } from "./pricing-sheet-from-prices";
import { PricingFolderMove } from "./pricing-folder-move";
import { PricingMarginGroups } from "./pricing-margin-groups";
import { Tabs } from "./ui/tabs";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { buildMarginTree, inFolder } from "@/domains/pricing/margin-tree";
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
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [defaultMargin, setDefaultMargin] = useState("");
  const [defaultRounding, setDefaultRounding] = useState("10");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkMargin, setBulkMargin] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("default");
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
      setPicked(new Set());
      setEdits({});
    } catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
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

  // shortcut: 트리·폴더 필터는 지금 불러온 페이지(50개) 기준, 전체 상품 순회 불러오기는 후속.
  const tree = buildMarginTree(state.items, state, folderOrder);
  const items = state.items.filter((i) => inFolder(i.category, folder));
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  const zeroMargin = state.defaultMargin === 0;
  const allColumns: CommonTableColumn<PriceItem>[] = [
    { key: "category", label: "분류", value: (i) => i.category || "미분류", sortable: true },
    { key: "name", label: "상품", value: (i) => i.name, sortable: true },
    { key: "cost", label: "매입가", value: (i) => i.cost, align: "right", sortable: true, render: (i) => `${i.cost.toLocaleString()}원` },
    { key: "source", label: "적용 마진", value: (i) => { const s = marginSource(i, state); return s.margin === null ? s.label : `${s.margin}% · ${s.label}`; }, sortable: true },
    { key: "price", label: "판매가", value: (i) => i.price, align: "right", sortable: true, render: (i) => `${i.price.toLocaleString()}원` },
    { key: "profit", label: "이익", value: (i) => i.price - i.cost, align: "right", sortable: true, render: (i) => <span className={i.price - i.cost <= 0 ? "font-bold text-rose-700" : ""}>{(i.price - i.cost).toLocaleString()}원</span> },
  ];
  const preview = (item: PriceItem) => {
    const raw = edits[item.id];
    if (raw === undefined || raw === "") return null;
    const margin = Number(raw);
    if (!Number.isFinite(margin) || margin < 0 || margin > 1000) return null;
    try { return calculatePrice(item.cost, margin, state.defaultRounding); } catch { return null; }
  };

  return <div className="space-y-4" aria-busy={busy}>
    {error && <p role="alert" className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {message && <p role="status" className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{message}</p>}

    {marginTemplates ? <PricingMarginTemplates companyId={companyId} state={state} /> : null}
    <Tabs ariaLabel="마진 설정" items={[{ id: "default", label: "기본 마진" }, { id: "category", label: "분류별 마진" }, { id: "items", label: "상품별 예외" }, { id: "all", label: "전체 판매가 보기" }]} onChange={setTab} value={tab} />
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>판매가에 아직 반영 안 된 변경 {state.pendingCount}개</span>
      <button className={box} disabled={busy || !state.pendingCount} onClick={() => void run([{ action: "recalculate" }], "판매가에 반영했습니다.", false)} type="button">지금 반영</button>
      <button className={box} disabled={busy || !state.lastBatch || state.restored} onClick={() => { if (state.lastBatch) void run([{ action: "restore", batchId: state.lastBatch }], "직전 반영을 되돌렸습니다.", false); }} type="button">직전 반영 되돌리기</button>
    </div>
    {/* ① 기본 마진 */}
    <section hidden={tab !== "default"} aria-label="회사 기본 마진" className={`rounded-xl border p-4 ${zeroMargin ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">① 기본 마진</h2>
          <p className="text-sm text-slate-600">모든 상품의 판매가 = 매입가 × (1 + 기본 마진). 단가표·견적서·주문 링크가 이 판매가를 씁니다.</p>
          {zeroMargin ? <p className="mt-1 text-sm font-bold text-amber-900">지금 기본 마진이 0%라 판매가가 매입가와 같습니다. 먼저 기본 마진을 정해 주세요.</p> : null}
        </div>
      </div>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run([{ action: "defaults", margin: Number(defaultMargin), rounding: Number(defaultRounding) }], `기본 마진 ${defaultMargin}%를 저장하고 판매가에 반영했습니다.`); }}>
        <label className="text-sm font-bold">기본 마진
          <span className="mt-1 flex items-center gap-1"><input aria-label="기본 마진율" className={`${box} w-24 text-right text-lg font-black`} inputMode="decimal" max="1000" min="0" onChange={(e) => setDefaultMargin(e.target.value)} required step="0.01" type="number" value={defaultMargin} /><span className="text-lg font-black">%</span></span>
        </label>
        <label className="text-sm font-bold">끝자리 올림
          <select className={`${box} mt-1 block`} onChange={(e) => setDefaultRounding(e.target.value)} value={defaultRounding}>{[1, 10, 100].map((n) => <option key={n} value={n}>{n}원 단위</option>)}</select>
        </label>
        <div className="flex flex-wrap gap-1.5">{[5, 10, 15, 20, 25, 30].map((n) => <button className={`rounded-full px-3 py-1.5 text-sm font-bold ${Number(defaultMargin) === n ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={n} onClick={() => setDefaultMargin(String(n))} type="button">{n}%</button>)}</div>
        <button className="h-10 rounded-md bg-teal-700 px-4 text-sm font-black text-white disabled:bg-slate-300" disabled={busy || defaultMargin === ""} type="submit">저장하고 판매가 반영</button>
      </form>
      {sample ? <p className="mt-2 text-sm text-slate-700">예시: 매입가 <strong>{sample.cost.toLocaleString()}원</strong> → 판매가 <strong className="text-teal-800">{sample.price.toLocaleString()}원</strong> (이익 {(sample.price - sample.cost).toLocaleString()}원)</p> : null}
    </section>

    {/* ② 카테고리별 */}
    <section hidden={tab !== "category"} aria-label="카테고리별 마진" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-black">② 카테고리별 마진</h2>
        <p className="text-sm text-slate-600">상품관리와 같은 전체 분류 경로를 골라 마진을 연결하세요. 상위 분류를 골라도 하위 분류는 자동으로 연결되지 않습니다.</p>
      </div>
      <PricingMarginGroups companyId={companyId} state={state} busy={busy} send={send} onBusy={setBusy} onMessage={setMessage} onError={setError} />
    </section>

    {/* ③ 상품별 */}
    <section hidden={tab !== "items"} aria-label="상품별 예외" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-black">③ 상품별 예외</h2>
        <p className="text-sm text-slate-600">기본 마진과 다르게 받을 상품만 고치세요. 체크해서 여러 개를 한 번에 바꿀 수 있습니다. 칸을 비우고 저장하면 기본 마진으로 돌아갑니다.</p>
      </div>
      <nav aria-label="분류 폴더" className="flex flex-wrap gap-1.5">
        <button aria-pressed={folder === null} className={`rounded-full border px-3 py-1 text-sm font-bold ${folder === null ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white"}`} onClick={() => setFolder(null)} type="button">전체 {state.items.length}</button>
        {tree.map((node) => <button aria-pressed={folder === node.path} className={`rounded-full border px-3 py-1 text-sm ${folder === node.path ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white"}`} key={node.path} onClick={() => setFolder(node.path)} style={{ marginLeft: node.depth * 12 }} type="button">{node.name} {node.count} · {node.badge}</button>)}
      </nav>
      {folder ? <PricingFolderMargin busy={busy} companyId={companyId} folder={folder} key={`margin-${folder}`} onBusy={setBusy} onError={setError} onMessage={setMessage} send={send} state={state} /> : null}
      {folder ? <PricingFolderMove busy={busy} companyId={companyId} folder={folder} onError={setError} onMoved={(to, count) => { setFolder(to); setPage(1); void run([{ action: "recalculate" }], `폴더를 "${to}"(으)로 옮기고(상품 ${count}개) 판매가를 다시 계산했습니다.`, false); }} /> : null}
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
        <input aria-label="상품 검색" className={`${box} min-w-[220px] flex-1`} maxLength={100} onChange={(e) => setSearchInput(e.target.value)} placeholder="상품명·카테고리 검색" value={searchInput} />
        <button className={box} disabled={busy} type="submit">검색</button>
        <span className="self-center text-sm text-slate-500">{state.total.toLocaleString()}개</span>
      </form>
      {picked.size ? (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white" role="toolbar" aria-label="선택한 상품 마진 일괄 변경">
          <strong>{picked.size}개 선택</strong>
          <span className="flex items-center gap-1">마진 <input aria-label="선택 상품 마진율" className="h-8 w-20 rounded px-2 text-right text-slate-900" inputMode="decimal" onChange={(e) => setBulkMargin(e.target.value)} placeholder="%" value={bulkMargin} />%</span>
          <button className="rounded bg-teal-500 px-2.5 py-1 font-bold disabled:opacity-50" disabled={busy || bulkMargin === ""} onClick={() => void run([{ action: "bulk-margin", productIds: Array.from(picked), margin: Number(bulkMargin) }], `${picked.size}개 상품 마진을 ${bulkMargin}%로 바꿨습니다.`)} type="button">적용</button>
          <button className="rounded bg-white/10 px-2.5 py-1 font-bold" disabled={busy} onClick={() => void run([{ action: "bulk-margin", productIds: Array.from(picked), margin: null }, { action: "bulk-direct", productIds: Array.from(picked), price: null }], `${picked.size}개 상품을 기본 마진으로 되돌렸습니다.`)} type="button">기본 마진으로</button>
          <button className="ml-auto rounded px-2 py-1 text-white/80" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-8 p-2"><input aria-label="이 페이지 전체 선택" checked={items.length > 0 && items.every((i) => picked.has(i.id))} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} type="checkbox" /></th>
              <th className="p-2">상품</th>
              <th className="p-2 text-right">매입가</th>
              <th className="p-2">마진</th>
              <th className="p-2 text-right">판매가</th>
              <th className="p-2 text-right">이익</th>
              <th className="p-2">직접 단가</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const source = marginSource(item, state);
              const next = preview(item);
              const price = next ?? item.price;
              return (
                <tr className={`border-t ${picked.has(item.id) ? "bg-teal-50" : ""}`} key={item.id}>
                  <td className="p-2"><input aria-label={`${item.name} 선택`} checked={picked.has(item.id)} onChange={(e) => setPicked((prev) => { const s = new Set(prev); if (e.target.checked) s.add(item.id); else s.delete(item.id); return s; })} type="checkbox" /></td>
                  <td className="p-2"><span className="font-semibold">{item.name}</span>{!item.active && <span className="text-xs text-slate-400"> (비활성)</span>}{item.category ? <span className="block text-xs text-slate-500">{item.category}</span> : null}</td>
                  <td className="p-2 text-right">{item.cost.toLocaleString()}원</td>
                  <td className="p-2">
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const raw = edits[item.id] ?? ""; void run([{ action: "item-margin", productId: item.id, margin: raw === "" ? null : Number(raw) }], `${item.name} 마진을 ${raw === "" ? "기본으로 되돌렸습니다" : `${raw}%로 바꿨습니다`}.`); }}>
                      <input aria-label={`${item.name} 마진율`} className="h-8 w-16 rounded border border-slate-300 px-1.5 text-right" disabled={source.kind === "direct"} inputMode="decimal" onChange={(e) => setEdits((prev) => ({ ...prev, [item.id]: e.target.value }))} placeholder={source.margin !== null ? String(source.margin) : "-"} value={edits[item.id] ?? (item.itemMargin !== null ? String(item.itemMargin) : "")} />
                      <span>%</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${source.kind === "default" ? "bg-slate-100 text-slate-600" : source.kind === "direct" ? "bg-violet-100 text-violet-800" : "bg-teal-100 text-teal-800"}`}>{source.label}</span>
                      {edits[item.id] !== undefined ? <button className="rounded bg-teal-700 px-2 py-1 text-xs font-bold text-white" disabled={busy} type="submit">저장</button> : null}
                    </form>
                  </td>
                  <td className={`p-2 text-right font-bold ${next !== null ? "text-teal-800" : ""}`}>{price.toLocaleString()}원</td>
                  <td className={`p-2 text-right ${price - item.cost <= 0 ? "font-bold text-rose-700" : "text-slate-600"}`}>{(price - item.cost).toLocaleString()}원</td>
                  <td className="p-2">
                    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const value = new FormData(e.currentTarget).get("price"); void run([{ action: "direct", productId: item.id, price: value === "" ? null : Number(value) }], `${item.name} 직접 단가를 ${value === "" ? "해제했습니다" : "저장했습니다"}.`); }}>
                      <input aria-label={`${item.name} 직접 단가`} className="h-8 w-24 rounded border border-slate-300 px-1.5 text-right" defaultValue={item.directPrice ?? ""} key={String(item.directPrice)} max="1000000000000" min="0" name="price" placeholder="없음" step="1" type="number" />
                      <button className="rounded border border-slate-300 px-2 py-1 text-xs" disabled={busy} type="submit">저장</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!items.length ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>해당 상품이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button className={box} disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)} type="button">이전</button>
        <span>{state.page} / {pages}</span>
        <button className={box} disabled={busy || page >= pages} onClick={() => setPage((p) => p + 1)} type="button">다음</button>
        <span className="ml-auto text-xs text-slate-500">직접 단가는 마진과 관계없이 그 금액을 그대로 씁니다(올림 없음).</span>
      </div>
    </section>

    {/* ④ 전체 판매가 보기 */}
    <section hidden={tab !== "all"} aria-label="전체 판매가 보기" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-black">④ 전체 판매가 보기</h2>
        <p className="text-sm text-slate-600">지금 마진 규칙으로 계산된 기본 판매가표입니다. 열 편집·CSV 내보내기는 표 위 버튼을 쓰세요. 지금은 불러온 페이지({state.items.length}개) 기준입니다.</p>
      </div>
      <PricingSheetFromPrices busy={busy} companyId={companyId} folder={folder} />
      <CommonDataTable columns={allColumns} filename="기본-판매가표.csv" rowKey={(i) => i.id} rows={state.items} settingsKey="margin-all-prices" />
    </section>
  </div>;
}
