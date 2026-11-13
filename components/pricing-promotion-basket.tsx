"use client";
import { useCallback, useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import { koreaDay, type CatalogChoice } from "@/domains/pricing/document";
import { basketLineError, discountFromPrice, marginFromPrice, priceFromDiscount, quickRange, type BasketBadge } from "@/domains/pricing/promotion-basket";
import { PricingProductPicker } from "./pricing-product-picker";

// CC-34-2: 견적서·단가표처럼 "고르고 담기". 왼쪽 상품 고르기(문서와 같은 부품) → 오른쪽 담은 품목 표 → 한 번에 등록.
// 저장은 품목마다 행사 1건(기존 save-promotion 그대로). 실패한 줄만 남기고 이유를 보여 준다.
type Line = { id: string; name: string; displayName: string; regular: number; cost: number; price: number; stock: string; taxType: "taxable" | "exempt"; error: string };
const input = "h-9 rounded-md border border-slate-300 bg-white px-2 text-right text-sm";
const NO_PROMOTIONS: never[] = [];

export function PricingPromotionBasket({ companyId, kind, onClose, onSaved }: { companyId: string; kind: BasketBadge; onClose: () => void; onSaved: (text: string) => void }) {
  const today = koreaDay();
  const [range, setRange] = useState(() => ({ startsOn: today, endsOn: quickRange(today, "thisWeek").endsOn }));
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    const remaining: Line[] = [];
    let saved = 0;
    for (const line of lines) {
      const problem = basketLineError({ productId: line.id, cost: line.cost, price: line.price, regular: line.regular });
      if (problem) { remaining.push({ ...line, error: problem }); continue; }
      try {
        const stock = line.stock.trim() === "" ? null : Number(line.stock);
        if (stock !== null && (!Number.isFinite(stock) || stock < 0)) throw new Error("재고는 0 이상의 숫자로 입력해 주세요.");
        await documentRequest(companyId, "save-promotion", {
          id: crypto.randomUUID(), expected: 0,
          content: { productId: line.id, name: line.name, displayName: line.displayName, startsOn: range.startsOn, endsOn: range.endsOn, cost: line.cost,
            margin: marginFromPrice(line.cost, line.price), stock, perStoreLimit: null, allowSheet: true, badge: kind, taxType: line.taxType },
        }, true);
        saved += 1;
      } catch (e) { remaining.push({ ...line, error: e instanceof Error ? e.message : "저장하지 못했습니다." }); }
    }
    setLines(remaining); setBusy(false);
    if (!remaining.length) return onSaved(`${kind} ${saved}개를 등록했습니다.`);
    setError(`${saved}개 등록, ${remaining.length}개는 저장하지 못했습니다. 빨간 줄을 고친 뒤 다시 눌러 주세요.`);
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs font-black text-slate-600"><tr><th className="px-3 py-2 text-left">상품</th><th className="px-2 py-2 text-right">정상가</th><th className="px-2 py-2 text-right">{kind === "임박" ? "처분가" : "행사가"}</th><th className="px-2 py-2 text-right">할인 %</th><th className="px-2 py-2 text-right">이익</th><th className="px-2 py-2 text-right">재고</th><th className="px-2 py-2" /></tr></thead>
              <tbody>{lines.map((l) => {
                const profit = l.cost > 0 ? l.price - l.cost : null;
                return <tr className={l.error ? "bg-rose-50" : ""} key={l.id}>
                  <td className="px-3 py-1.5"><span className="font-semibold">{l.displayName}</span>{l.error ? <span className="block text-xs font-bold text-rose-700" role="alert">{l.error}</span> : null}</td>
                  <td className="px-2 text-right tabular-nums">{l.regular.toLocaleString("ko-KR")}원</td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} ${kind === "임박" ? "처분가" : "행사가"}`} className={`${input} w-28`} inputMode="numeric" key={`p-${l.id}-${l.price}`} defaultValue={l.price}
                    onBlur={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v) && v !== l.price) patch(l.id, { price: Math.max(0, Math.round(v)) }); }} /></td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} 할인 %`} className={`${input} w-20`} inputMode="decimal" key={`d-${l.id}-${l.price}`} defaultValue={discountFromPrice(l.regular, l.price) ?? ""}
                    onBlur={(e) => { const v = Number(e.currentTarget.value); if (e.currentTarget.value.trim() !== "" && Number.isFinite(v)) patch(l.id, { price: priceFromDiscount(l.regular, v) }); }} /></td>
                  <td className={`px-2 text-right tabular-nums ${profit !== null && profit <= 0 ? "font-bold text-rose-700" : ""}`}>{profit === null ? "-" : `${profit.toLocaleString("ko-KR")}원`}</td>
                  <td className="px-2 text-right"><input aria-label={`${l.displayName} 재고`} className={`${input} w-20`} inputMode="numeric" onChange={(e) => patch(l.id, { stock: e.target.value })} placeholder="제한 없음" value={l.stock} /></td>
                  <td className="px-2"><button aria-label={`${l.displayName} 빼기`} className="min-h-[36px] px-2 text-xs font-bold text-rose-700" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} type="button">✕</button></td>
                </tr>;
              })}{!lines.length ? <tr><td className="px-4 py-10 text-center font-bold text-slate-500" colSpan={7}>왼쪽에서 상품을 골라 담아 주세요. 할인 %를 넣으면 {kind === "임박" ? "처분가" : "행사가"}가 자동으로 계산됩니다.</td></tr> : null}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || !lines.length} onClick={() => void save()} type="button">{busy ? "등록 중…" : `${lines.length}개 ${kind} 등록`}</button>
            <span className="text-xs text-slate-500">행사가는 매입가 기준 마진으로 저장되며 10원 단위로 올림됩니다. 노출 대상은 전체 매장입니다(특정 매장은 등록 후 수정에서).</span>
          </div>
        </div>
      </div>
    </section>
  </div>;
}
