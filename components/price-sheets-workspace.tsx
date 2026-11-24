"use client";
import { InfoTooltip } from "@/components/info-tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PriceItem, PriceState } from "@/domains/pricing/price-rules";
import { calculatePrice, PRICE_ROUNDING_UNITS } from "@/domains/pricing/price-rules";
import { templatePrice, type MarginTemplate } from "@/domains/pricing/margin-template";
import type { PricingBulkCommand, PricingCommand } from "@/application/pricing/manage-price-sheets";


import { PricingMarginTemplates } from "./pricing-margin-templates";
import { PricingFolderMargin } from "./pricing-folder-margin";
import { PricingSheetFromPrices } from "./pricing-sheet-from-prices";
import { PricingMarginGroups } from "./pricing-margin-groups";
import { PricingSalesPriceTable } from "./pricing-sales-price-table";
import { PricingCatalogStores } from "./pricing-catalog-stores";
import { pricingCatalogViewFrom, pricingCatalogViews } from "./pricing-catalog-view";
import { fetchAllPriceItems } from "@/lib/pricing/fetch-all-price-items";
import { buildMarginTree } from "@/domains/pricing/margin-tree";
import { splitHidden } from "@/domains/pricing/price-health";
import { toFolderOrder, type FolderOrder } from "@/domains/pricing/category-tree";
import { formatWon } from "@/domains/shared/money";
import { Notice } from "./ui/notice";
import { ErrorState, LoadingState } from "./ui/state";
import { Tabs } from "./ui/tabs";
export { marginSource } from "./pricing-margin-group-options";

const box = "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm";
type CatalogTemplate = { id: string; name: string; margin: number; rounding: number; categories: { category: string; margin: number }[] };
const catalogModel = (template: CatalogTemplate): MarginTemplate => ({ margin: template.margin, rounding: template.rounding, categories: template.categories, items: [] });

/**
 * 11/4 마진 설정 단순화.
 * ① 기본 마진 하나만 정하면 모든 상품 판매가가 매입가 × (1+마진)으로 바로 계산됩니다.
 * ② 카테고리별 마진은 기존 그룹과 분류 연결을 카드에서 고릅니다.
 * ③ 다른 마진을 줄 상품만 표에서 골라 한 번에 바꿉니다(개별 마진 · 직접 단가).
 */
export function PriceSheetsWorkspace({ companyId, marginTemplates = false }: { companyId: string; marginTemplates?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = pricingCatalogViewFrom(searchParams.get("view"), marginTemplates);
  const tabItems = pricingCatalogViews(marginTemplates).map((id) => ({ id, label: id === "prices" ? "판매가" : id === "catalogs" ? "카탈로그" : id === "stores" ? "매장 연결" : "마진 그룹 · 고급" }));
  const selectView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", pricingCatalogViewFrom(next, marginTemplates));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [state, setState] = useState<PriceState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [undoable, setUndoable] = useState(false); // CC-30a: 방금 즉시 반영한 변경만 토스트에서 되돌린다(직전 1회)
  const search = "", page = 1; // 판매가 탭은 전체 상품을 한 번에 읽는다(서버 쪽 검색·쪽 나누기는 쓰지 않음)
  const [defaultMargin, setDefaultMargin] = useState("");
  const [defaultRounding, setDefaultRounding] = useState("10");
  const [showDefault, setShowDefault] = useState(false);
  // CC-30a: 표 하나에 전체 상품. 바꿀 때마다(version) 다시 읽는다. 못 읽으면 첫 쪽만으로 계속.
  const [allItems, setAllItems] = useState<PriceItem[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { void fetchAllPriceItems(companyId).then(setAllItems).catch(() => setAllItems(null)); }, [companyId, version]);
  const [catalogs, setCatalogs] = useState<CatalogTemplate[]>([]);
  useEffect(() => {
    if (!marginTemplates) { setCatalogs([]); return; }
    void fetch(`/api/margin-templates?${new URLSearchParams({ companyId })}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || "카탈로그를 불러오지 못했습니다."); return body as { templates?: CatalogTemplate[] }; })
      .then((body) => setCatalogs(body.templates ?? []))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "카탈로그를 불러오지 못했습니다."));
  }, [companyId, marginTemplates]);
  const selectedCatalog = catalogs.find((catalog) => catalog.id === searchParams.get("catalog")) ?? null;
  const loadedItems = allItems ?? state?.items;
  const catalogPrices = useMemo(() => {
    if (!selectedCatalog) return null;
    const model = catalogModel(selectedCatalog);
    return new Map((loadedItems ?? []).map((item) => [item.id, templatePrice(model, item).price]));
  }, [loadedItems, selectedCatalog]);
  const selectCatalog = (catalog: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "prices");
    if (catalog) params.set("catalog", catalog); else params.delete("catalog");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
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
    setBusy(true); setError(""); setMessage(""); setUndoable(false);
    try {
      let last: PriceState | null = null;
      for (const command of commands) last = await send(command);
      const changed = apply && last ? last.pendingCount : 0; // 반영 전 대기 수 = 이번에 바뀌는 판매가 수
      if (apply && last && last.pendingCount > 0) last = await send({ action: "recalculate" });
      setMessage(changed > 0 ? `${done} 판매가 ${changed}개 바뀜.` : done);
      setUndoable(changed > 0);
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
    try { return { cost: 1833, price: calculatePrice(1833, margin, rounding) }; } catch { return null; }
  }, [defaultMargin, defaultRounding]);

  if (!state) return <div className="space-y-3">{error ? <ErrorState message={error} /> : <LoadingState label="불러오는 중…" />}</div>;

  const deferFifty = Number(defaultRounding) === 50 || state.defaultRounding === 50;
  const zeroMargin = state.defaultMargin === 0;
  return <div className="space-y-4" aria-busy={busy}>
    {error && <ErrorState message={error} />}
    {message && <Notice kind="success">{message}
      {undoable && state.lastBatch && !state.restored ? <button className="rounded border border-teal-700 px-2 py-1 text-xs font-bold" disabled={busy} onClick={() => { if (state.lastBatch) void run([{ action: "restore", batchId: state.lastBatch }], "직전 반영을 되돌렸습니다.", false); }} type="button">되돌리기</button> : null}</Notice>}

    <Tabs ariaLabel="가격 관리 보기" className="flex-nowrap" items={tabItems} onChange={selectView} value={view} variant="chip" />

    {view === "catalogs" && marginTemplates ? <PricingMarginTemplates companyId={companyId} state={state} /> : null}
    {view === "stores" && marginTemplates ? <PricingCatalogStores companyId={companyId} /> : null}
    {view === "prices" ? <>
    {state.pendingCount > 0 || (state.lastBatch && !state.restored) ? <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>판매가에 아직 반영 안 된 변경 {state.pendingCount}개</span>
      <button className={box} disabled={busy || !state.pendingCount} onClick={() => void run([{ action: "recalculate" }], "판매가에 반영했습니다.", false)} type="button">지금 반영</button>
      <button className={box} disabled={busy || !state.lastBatch || state.restored} onClick={() => { if (state.lastBatch) void run([{ action: "restore", batchId: state.lastBatch }], "직전 반영을 되돌렸습니다.", false); }} type="button">직전 반영 되돌리기</button>
    </div> : null}
    {/* ① 기본 마진 */}
    <section aria-label="회사 기본 마진" className={`rounded-xl border px-3 py-2 ${zeroMargin ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold">기본 마진 {state.defaultMargin}% · {state.defaultRounding}원 올림 <InfoTooltip size="sm" text="모든 상품의 판매가 = 매입가 × (1 + 기본 마진). 단가표·견적서·주문 링크가 이 판매가를 씁니다." /> <button className="ml-2 rounded border border-slate-300 px-2 py-1 text-xs font-bold" onClick={() => setShowDefault((v) => !v)} type="button">{showDefault ? "닫기" : "바꾸기"}</button></p>
      <PricingSheetFromPrices busy={busy} companyId={companyId} folder={folder} />
      </div>
      {zeroMargin ? <p className="mt-1 text-sm font-bold text-amber-900">지금 기본 마진이 0%라 판매가가 매입가와 같습니다. 먼저 기본 마진을 정해 주세요.</p> : null}
      {showDefault || zeroMargin ? <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run([{ action: "defaults", margin: Number(defaultMargin), rounding: Number(defaultRounding) }], deferFifty ? "설정을 저장했습니다. 변경 대기 건을 확인한 뒤 지금 반영을 눌러 주세요." : `기본 마진 ${defaultMargin}%를 저장하고 판매가에 반영했습니다.`, !deferFifty); }}>
        <label className="text-sm font-bold">기본 마진
          <span className="mt-1 flex items-center gap-1"><input aria-label="기본 마진율" className={`${box} w-24 text-right text-lg font-black`} inputMode="decimal" max="1000" min="0" onChange={(e) => setDefaultMargin(e.target.value)} required step="0.01" type="number" value={defaultMargin} /><span className="text-lg font-black">%</span></span>
        </label>
        <label className="text-sm font-bold">끝자리 올림
          <select className={`${box} mt-1 block min-h-11`} onChange={(e) => setDefaultRounding(e.target.value)} value={defaultRounding}>{PRICE_ROUNDING_UNITS.map((n) => <option key={n} value={n}>{n}원 단위 올림</option>)}</select>
        </label>
        <div className="flex flex-wrap gap-1.5">{[5, 10, 15, 20, 25, 30].map((n) => <button className={`rounded-full px-3 py-1.5 text-sm font-bold ${Number(defaultMargin) === n ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={n} onClick={() => setDefaultMargin(String(n))} type="button">{n}%</button>)}</div>
        <button className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-black text-white disabled:bg-slate-300" disabled={busy || defaultMargin === ""} type="submit">{deferFifty ? "설정 저장 · 판매가 반영 대기" : "저장하고 판매가 반영"}</button>
      </form> : null}
      {(showDefault || zeroMargin) && sample ? <p className="mt-2 text-sm text-slate-700">예시: 매입가 <strong>{formatWon(sample.cost)}</strong> → 판매가 <strong className="text-teal-800">{formatWon(sample.price)}</strong> (이익 {formatWon(sample.price - sample.cost)})</p> : null}
    </section>

    {marginTemplates ? <label className="flex flex-wrap items-center gap-2 text-sm font-bold">카탈로그로 보기:
      <select aria-label="카탈로그로 보기" className={box} onChange={(event) => selectCatalog(event.target.value)} value={selectedCatalog?.id ?? ""}>
        <option value="">기본</option>{catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.name}</option>)}
      </select>
    </label> : null}
    <PricingSalesPriceTable busy={busy} catalog={catalogPrices ? { prices: catalogPrices } : null} folder={folder} folderTools={folder ? <PricingFolderMargin busy={busy} companyId={companyId} folder={folder} key={`margin-${folder}`} onBusy={setBusy} onError={setError} onMessage={setMessage} send={send} state={state} /> : null} items={allItems ?? state.items} onFolder={setFolder} run={run} state={state} tree={buildMarginTree(splitHidden(allItems ?? state.items).visible, state, folderOrder)} />
    {allItems === null ? <p className="text-xs text-slate-500">전체 상품을 읽지 못해 이 페이지({state.items.length}개)만 보여 줍니다.</p> : null}
    </> : null}
    {view === "groups" ? <section aria-label="마진 그룹 직접 관리" className="rounded-xl border border-slate-200 bg-white p-3" data-testid="margin-advanced">
      <PricingMarginGroups companyId={companyId} state={state} busy={busy} send={send} onBusy={setBusy} onMessage={setMessage} onError={setError} />
    </section> : null}
  </div>;
}
