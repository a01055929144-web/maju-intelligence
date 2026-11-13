"use client";
import { useCallback, useEffect, useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import { koreaDay, type CatalogChoice, type Promotion } from "@/domains/pricing/document";
import { basketLineError, discountFromPrice, marginFromPrice, priceFromDiscount, quickRange, type BasketBadge } from "@/domains/pricing/promotion-basket";
import { PricingProductPicker } from "./pricing-product-picker";

// CC-34-2: 견적서·단가표처럼 "고르고 담기". 왼쪽 상품 고르기(문서와 같은 부품) → 오른쪽 담은 품목 표 → 한 번에 등록.
// 저장은 품목마다 행사 1건(기존 save-promotion 그대로). 실패한 줄만 남기고 이유를 보여 준다.
type Line = { id: string; name: string; displayName: string; regular: number; cost: number; price: number; stock: string; taxType: "taxable" | "exempt"; error: string };
const input = "h-9 rounded-md border border-slate-300 bg-white px-2 text-right text-sm";
const NO_PROMOTIONS: never[] = [];

type StoreHit = { id: string; name: string };
export function PricingPromotionBasket({ audienceEnabled = false, companyId, kind, onClose, onSaved }: { audienceEnabled?: boolean; companyId: string; kind: BasketBadge; onClose: () => void; onSaved: (text: string) => void }) {
  const today = koreaDay();
  const [range, setRange] = useState(() => ({ startsOn: today, endsOn: quickRange(today, "thisWeek").endsOn }));
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCost, setShowCost] = useState(false); // 더보기: 행사 매입가(이 행사에만 쓰는 매입가) 직접 입력
  const [error, setError] = useState("");
  // 노출 대상(PROMOTION_AUDIENCE 켠 회사만): 전체 매장 / 고른 매장만. 담은 모든 행사에 같은 대상을 적용한다.
  const [onlyStores, setOnlyStores] = useState(false);
  const [stores, setStores] = useState<StoreHit[]>([]);
  const [storeQuery, setStoreQuery] = useState("");
  const [storeHits, setStoreHits] = useState<StoreHit[]>([]);
  useEffect(() => {
    if (!audienceEnabled || !onlyStores || storeQuery.trim().length < 1) { setStoreHits([]); return; }
    const timer = setTimeout(() => {
      void fetch(`/api/promotion-audience?${new URLSearchParams({ companyId, q: storeQuery.trim() })}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { customers: [] })).then((b: { customers?: StoreHit[] }) => setStoreHits(b.customers ?? [])).catch(() => setStoreHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [audienceEnabled, onlyStores, storeQuery, companyId]);
  const loadPrices = useCallback(
    (ids: string[]) => documentRequest<{ items: CatalogChoice[] }>(companyId, "catalog", { productIds: ids.slice(0, 100) }).then((r) => r.result.items),
    [companyId],
  );
  const add = (items: CatalogChoice[]) => setLines((current) => {
    const have = new Set(current.map((l) => l.id));
    return [...current, ...items.filter((i) => !have.has(i.id)).map((i): Line => ({
      id: i.id, name: i.name, displayName: i.displayName || i.name, regular: i.price, cost: i.cost ?? 0, price: i.price, stock: "",
      taxType: i.taxType === "exempt" ? "exempt" : "taxable", error: "",
    }))];
  });
  const patch = (id: string, next: Partial<Line>) => setLines((current) => current.map((l) => (l.id === id ? { ...l, ...next, error: "" } : l)));
  const dateLabel = kind === "임박" ? "유통기한(그날 종료)" : "종료";

  async function save() {
    setBusy(true); setError("");
    if (range.startsOn > range.endsOn) { setBusy(false); return setError("시작일이 종료일보다 늦습니다."); }
    if (audienceEnabled && onlyStores && !stores.length) { setBusy(false); return setError("특정 매장만 노출하려면 매장을 하나 이상 골라 주세요."); }
    const remaining: Line[] = [];
    let saved = 0;
    const audienceFailed: string[] = [];
    for (const line of lines) {
      const problem = basketLineError({ productId: line.id, cost: line.cost, price: line.price, regular: line.regular });
      if (problem) { remaining.push({ ...line, error: problem }); continue; }
      try {
        const stock = line.stock.trim() === "" ? null : Number(line.stock);
        if (stock !== null && (!Number.isFinite(stock) || stock < 0)) throw new Error("재고는 0 이상의 숫자로 입력해 주세요.");
        const promotionId = crypto.randomUUID();
        await documentRequest(companyId, "save-promotion", {
          id: promotionId, expected: 0,
          content: { productId: line.id, name: line.name, displayName: line.displayName, startsOn: range.startsOn, endsOn: range.endsOn, cost: line.cost,
            margin: marginFromPrice(line.cost, line.price), stock, perStoreLimit: null, allowSheet: true, badge: kind, taxType: line.taxType },
        }, true);
        saved += 1;
        if (audienceEnabled && onlyStores) try {
          // 저장이 revision을 올리므로 최신 revision을 읽어 대상을 한 번에 넣는다. 실패하면 행사는 저장된 채(전체 매장 노출)로 알린다.
          const latest = (await documentRequest<Promotion[]>(companyId, "promotions")).result.find((x) => x.id === promotionId);
          const res = await fetch("/api/promotion-audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, promotionId, expected: latest?.revision ?? 0, audience: "only", targets: stores.map((s) => ({ kind: "customer", id: s.id })) }) });
          if (!res.ok) audienceFailed.push(line.displayName);
        } catch { audienceFailed.push(line.displayName); }
      } catch (e) { remaining.push({ ...line, error: e instanceof Error ? e.message : "저장하지 못했습니다." }); }
    }
    setLines(remaining); setBusy(false);
    if (audienceFailed.length) setError(`${audienceFailed.join(", ")}: 행사는 저장했지만 노출 대상은 저장하지 못했습니다(전체 매장에 보임). 행사 목록에서 대상을 고쳐 주세요.`);
    if (!remaining.length && !audienceFailed.length) return onSaved(`${kind} ${saved}개를 등록했습니다.`);
    if (!remaining.length) return;
    setError(`${saved}개 등록, ${remaining.length}개는 저장하지 못했습니다. 빨간 줄을 고친 뒤 다시 눌러 주세요.${audienceFailed.length ? ` 노출 대상 저장 실패: ${audienceFailed.join(", ")}(전체 매장에 보임, 행사 목록에서 고쳐 주세요).` : ""}`);
  }

  return <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
    <section aria-label={`${kind} 상품 담기`} aria-modal="true" className="h-full w-full max-w-[1200px] space-y-3 overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">{kind} 상품 담기</h2><button className="min-h-[44px] rounded-lg border px-4" onClick={onClose} type="button">닫기</button></div>
      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
        <label className="text-sm font-bold">시작<input className={`${input} ml-1 text-left`} min={today} onChange={(e) => setRange({ ...range, startsOn: e.target.value })} type="date" value={range.startsOn} /></label>
        <label className="text-sm font-bold">{dateLabel}<input className={`${input} ml-1 text-left`} min={range.startsOn} onChange={(e) => setRange({ ...range, endsOn: e.target.value })} type="date" value={range.endsOn} /></label>
        {([["thisWeek", "이번 주"], ["nextWeek", "다음 주"], ["thisMonth", "이번 달"]] as const).map(([key, label]) =>
          <button className="min-h-[36px] rounded-full border border-slate-300 px-3 text-xs font-bold" key={key} onClick={() => setRange(quickRange(today, key))} type="button">{label}</button>)}
      </div>
      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
        <PricingProductPicker added={new Set(lines.map((l) => l.id))} busy={busy} companyId={companyId} loadPrices={loadPrices} manager onAdd={add}
          onAddPromotion={() => undefined} onAddPromotions={() => undefined} onOpenLibrary={() => undefined} onRefreshPromotions={() => undefined} promotions={NO_PROMOTIONS} />
        <div className="min-w-0 space-y-2">
          {audienceEnabled ? <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3"><span className="font-bold">노출 대상</span>
              <label className="flex items-center gap-1"><input checked={!onlyStores} name="basket-audience" onChange={() => setOnlyStores(false)} type="radio" />전체 매장</label>
              <label className="flex items-center gap-1"><input checked={onlyStores} name="basket-audience" onChange={() => setOnlyStores(true)} type="radio" />고른 매장만</label></div>
            {onlyStores ? <div className="space-y-1">
              <input aria-label="대상 매장 찾기" className="h-9 w-full max-w-xs rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setStoreQuery(e.target.value)} placeholder="매장 이름 검색" value={storeQuery} />
              {storeHits.filter((h) => !stores.some((s) => s.id === h.id)).length ? <div className="flex flex-wrap gap-1">{storeHits.filter((h) => !stores.some((s) => s.id === h.id)).map((h) => <button className="rounded-full border border-slate-300 px-2 py-1 text-xs font-bold" key={h.id} onClick={() => setStores([...stores, h])} type="button">+ {h.name}</button>)}</div> : null}
              <div className="flex flex-wrap gap-1">{stores.map((s) => <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-xs font-bold text-teal-900" key={s.id}>{s.name}<button aria-label={`${s.name} 빼기`} onClick={() => setStores(stores.filter((x) => x.id !== s.id))} type="button">✕</button></span>)}{!stores.length ? <span className="text-xs text-slate-500">매장을 검색해 하나 이상 골라 주세요.</span> : null}</div>
            </div> : null}
          </div> : null}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600"><tr><th className="px-3 py-2 text-left">상품</th><th className="px-2 py-2 text-right">정상가</th><th className="px-2 py-2 text-right">{kind === "임박" ? "처분가" : "행사가"}</th><th className="px-2 py-2 text-right">할인 %</th>{showCost ? <th className="px-2 py-2 text-right">행사 매입가</th> : null}<th className="px-2 py-2 text-right">이익</th><th className="px-2 py-2 text-right">재고</th><th className="px-2 py-2" /></tr></thead>
              <tbody>{lines.map((l) => {
                const profit = l.cost > 0 ? l.price - l.cost : null;
                return <tr className={l.error ? "bg-rose-50" : ""} key={l.id}>
                  <td className="px-3 py-1.5"><span className="font-semibold">{l.displayName}</span>{l.error ? <span className="block text-xs font-bold text-rose-700" role="alert">{l.error}</span> : null}</td>
                  <td className="px-2 text-right tabular-nums">{l.regular.toLocaleString("ko-KR")}원</td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} ${kind === "임박" ? "처분가" : "행사가"}`} className={`${input} w-28`} inputMode="numeric" key={`p-${l.id}-${l.price}`} defaultValue={l.price}
                    onBlur={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v) && v !== l.price) patch(l.id, { price: Math.max(0, Math.round(v)) }); }} /></td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} 할인 %`} className={`${input} w-20`} inputMode="decimal" key={`d-${l.id}-${l.price}`} defaultValue={discountFromPrice(l.regular, l.price) ?? ""}
                    onBlur={(e) => { const v = Number(e.currentTarget.value); if (e.currentTarget.value.trim() !== "" && Number.isFinite(v)) patch(l.id, { price: priceFromDiscount(l.regular, v) }); }} /></td>
                  {showCost ? <td className="px-2 text-right"><input aria-label={`${l.displayName} 행사 매입가`} className={`${input} w-24`} inputMode="numeric" key={`c-${l.id}-${l.cost}`} defaultValue={l.cost} onBlur={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v) && v >= 0 && v !== l.cost) patch(l.id, { cost: Math.round(v) }); }} /></td> : null}
                  <td className={`px-2 text-right tabular-nums ${profit !== null && profit <= 0 ? "font-bold text-rose-700" : ""}`}>{profit === null ? "-" : `${profit.toLocaleString("ko-KR")}원`}</td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} 재고`} className={`${input} w-20`} inputMode="numeric" onChange={(e) => patch(l.id, { stock: e.target.value })} placeholder="제한 없음" value={l.stock} /></td>
                  <td className="px-2"><button aria-label={`${l.displayName} 빼기`} className="min-h-[36px] px-2 text-xs font-bold text-rose-700" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} type="button">✕</button></td>
                </tr>;
              })}{!lines.length ? <tr><td className="px-4 py-10 text-center font-bold text-slate-500" colSpan={showCost ? 8 : 7}>왼쪽에서 상품을 골라 담아 주세요. 할인 %를 넣으면 {kind === "임박" ? "처분가" : "행사가"}가 자동으로 계산됩니다.</td></tr> : null}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || !lines.length} onClick={() => void save()} type="button">{busy ? "등록 중…" : `${lines.length}개 ${kind} 등록`}</button>
            <button aria-pressed={showCost} className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-xs font-bold" onClick={() => setShowCost(!showCost)} type="button">더보기: 행사 매입가 {showCost ? "숨기기" : "칸 보이기"}</button>
            <span className="text-xs text-slate-500">행사가는 매입가 기준 마진으로 저장되며 10원 단위로 올림됩니다.{audienceEnabled ? "" : " 노출 대상은 전체 매장입니다."}</span>
          </div>
        </div>
      </div>
    </section>
  </div>;
}
