"use client";

import { Trash2 } from "lucide-react";
import type { CatalogChoice, DocumentContent, PrintLine } from "@/domains/pricing/document";
import { DEFAULT_DISPLAY } from "@/domains/pricing/document";

/**
 * 11/4: 문서 보기 — A4 한 장처럼 보이는 편집 화면(시안 ①).
 * 품목명·단가를 종이 위에서 바로 고치고, 아래 칸에서 품목을 찾아 담습니다.
 * 품목이 많으면 1~3열 격자로, 행사·임박은 위쪽 블록(카드/표)으로 보여 줍니다.
 */
export function PricingDocPaper({
  baselines,
  catalog,
  catalogInput,
  content,
  editable,
  onAdd,
  onContent,
  onSearch,
  setCatalogInput
}: {
  readonly baselines: Record<string, number>;
  readonly catalog: CatalogChoice[];
  readonly catalogInput: string;
  readonly content: DocumentContent;
  readonly editable: boolean;
  readonly onAdd: (item: CatalogChoice) => void;
  readonly onContent: (content: DocumentContent) => void;
  readonly onSearch: () => void;
  readonly setCatalogInput: (value: string) => void;
}) {
  const display = content.display || DEFAULT_DISPLAY;
  const accent = content.theme === "blue" ? "#1d4ed8" : content.theme === "green" ? "#047857" : "#1f2937";
  const indexed = content.lines.map((line, index) => ({ index, line }));
  const promos = indexed.filter(({ line }) => line.promotionId);
  const regular = indexed.filter(({ line }) => !line.promotionId);
  const columns = display.columns;
  const perColumn = Math.ceil(regular.length / columns) || 0;
  const chunks = Array.from({ length: columns }, (_, i) => regular.slice(i * perColumn, (i + 1) * perColumn)).filter((chunk) => chunk.length);
  const headerInfo = display.info.filter((item) => item.place === "header");
  const footerInfo = display.info.filter((item) => item.place === "footer");

  function updateLine(index: number, patch: Partial<PrintLine>) {
    onContent({ ...content, lines: content.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }
  function removeLine(index: number) {
    onContent({ ...content, lines: content.lines.filter((_, i) => i !== index) });
  }
  const cell = "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-teal-500 focus:bg-white disabled:hover:border-transparent";

  return (
    <article className="mx-auto w-full max-w-[860px] space-y-4 rounded-md bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.10)] sm:p-10" style={{ borderTop: `6px solid ${accent}` }}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <input aria-label="회사명" className={`${cell} text-lg font-black`} disabled={!editable} maxLength={100} onChange={(e) => onContent({ ...content, companyName: e.target.value })} style={{ color: accent }} value={content.companyName} />
          {headerInfo.length ? <p className="px-1 text-xs text-slate-600">{headerInfo.map((item) => `${item.label} ${item.value}`).join(" · ")}</p> : <p className="px-1 text-xs text-slate-400">오른쪽 &lsquo;보여줄 정보&rsquo;에서 연락처·주소 등을 넣으세요.</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-black">{content.kind === "sheet" ? "단가표" : "견적서"}</p>
          <label className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-600">유효
            <input aria-label="유효기간" className="rounded border border-slate-200 px-1 py-0.5" disabled={!editable} onChange={(e) => onContent({ ...content, validUntil: e.target.value })} type="date" value={content.validUntil} />
            까지 · 부가세 별도
          </label>
        </div>
      </header>
      <label className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-slate-500">받는 곳</span>
        <input className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1" disabled={!editable} maxLength={100} onChange={(e) => onContent({ ...content, recipient: e.target.value })} placeholder={content.kind === "sheet" ? "전체 거래처" : "매장 이름"} value={content.recipient} />
      </label>

      {promos.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-black text-amber-900">행사·임박 {promos.length}개 <span className="font-semibold text-amber-800">· 매장 화면·인쇄에 위쪽에 나옵니다</span></p>
          {display.promoLayout === "table" ? (
            <table className="w-full text-sm"><tbody>
              {promos.map(({ index, line }) => (
                <tr className="border-b border-amber-200" key={`${line.productId}:${line.promotionId}`}>
                  <td className="py-1"><span className="mr-1 rounded bg-amber-200 px-1 text-xs font-bold">{line.badge || "행사"}</span>{line.displayName}</td>
                  <td className="py-1 text-slate-600">{line.spec} {line.unit}</td>
                  <td className="py-1 text-right font-bold">{line.price.toLocaleString()}원</td>
                  <td className="py-1 text-right text-xs text-slate-600">{line.endsOn ? `${line.endsOn}까지` : ""}</td>
                  <td className="w-8 py-1 text-right">{editable ? <button aria-label={`${line.displayName} 빼기`} className="text-slate-400 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}</td>
                </tr>
              ))}
            </tbody></table>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {promos.map(({ index, line }) => (
                <div className="relative rounded-md bg-white p-2" key={`${line.productId}:${line.promotionId}`}>
                  <p className="text-sm font-bold"><span className="mr-1 rounded bg-amber-200 px-1 text-xs">{line.badge || "행사"}</span>{line.displayName}</p>
                  <p className="text-xs text-slate-600">{line.spec} {line.unit}{line.endsOn ? ` · ${line.endsOn}까지` : ""}</p>
                  <p className="font-black text-orange-700">{line.price.toLocaleString()}원</p>
                  {editable ? <button aria-label={`${line.displayName} 빼기`} className="absolute right-1.5 top-1.5 text-slate-400 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, chunks.length)}, minmax(0, 1fr))` }}>
        {chunks.map((chunk, c) => (
          <table className="w-full table-fixed border-collapse text-sm" key={c}>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="border-b py-1.5">품목</th>
                {content.showSpec ? <th className={`border-b py-1.5 ${columns > 1 ? "w-16" : "w-28"}`}>규격·단위</th> : null}
                {content.showPrice ? <th className="w-24 border-b py-1.5 text-right">단가</th> : null}
                {editable ? <th className="w-7 border-b" /> : null}
              </tr>
            </thead>
            <tbody>
              {chunk.map(({ index, line }) => (
                <tr className={`border-b border-slate-100 ${line.visible ? "" : "opacity-40"} ${line.price < (baselines[line.productId] ?? 0) ? "bg-orange-50" : ""}`} key={`${line.productId}:${line.promotionId}`}>
                  <td className="py-0.5">
                    <input aria-label={`품목 ${index + 1} 노출 상품명`} className={`${cell} font-semibold`} disabled={!editable} maxLength={120} onChange={(e) => updateLine(index, { displayName: e.target.value })} value={line.displayName} />
                    {content.showBrand && line.brand ? <span className="block px-1 text-xs text-slate-500">{line.brand}</span> : null}
                  </td>
                  {content.showSpec ? <td className="truncate py-0.5 text-xs text-slate-600" title={`${line.spec} ${line.unit}`}>{line.spec} {line.unit}</td> : null}
                  {content.showPrice ? (
                    <td className="py-0.5">
                      <input aria-label={`품목 ${index + 1} 단가`} className={`${cell} text-right font-bold`} disabled={!editable} inputMode="numeric" onChange={(e) => { const value = Number(e.target.value.replace(/[^0-9]/g, "")); if (Number.isSafeInteger(value)) updateLine(index, { price: value }); }} value={line.price.toLocaleString()} />
                    </td>
                  ) : null}
                  {editable ? <td className="py-0.5 text-right"><button aria-label={`${line.displayName} 빼기`} className="text-slate-300 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {editable ? (
        <div className="space-y-2">
          <form className="flex items-center gap-2 rounded-lg border border-dashed border-slate-400 px-3 py-2" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>
            <span className="font-black text-teal-700">+</span>
            <input aria-label="추가할 품목 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" maxLength={100} onChange={(e) => setCatalogInput(e.target.value)} placeholder="품목 추가 — 이름·코드로 찾고 엔터" value={catalogInput} />
            <span className="shrink-0 text-xs text-slate-500">{content.lines.length}개 담음</span>
          </form>
          {catalog.length ? (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
              {catalog.map((item) => (
                <button className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold hover:border-teal-400" key={item.id} onClick={() => onAdd(item)} type="button">
                  {item.displayName || item.name} · {item.price.toLocaleString()}원 +
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <footer className="space-y-1 border-t pt-3 text-xs text-slate-700">
        {footerInfo.length ? <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">{footerInfo.map((item) => <p key={item.key || item.label}>{item.label} · {item.value}</p>)}</div> : null}
        <textarea aria-label="하단 안내" className="w-full resize-y rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-teal-500" disabled={!editable} maxLength={400} onChange={(e) => onContent({ ...content, footer: e.target.value })} placeholder="하단에 넣을 문구 (예: 시세 품목은 경매가에 따라 달라질 수 있습니다)" rows={2} value={content.footer} />
      </footer>
    </article>
  );
}
