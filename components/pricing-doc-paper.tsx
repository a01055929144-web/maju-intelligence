"use client";
import { MoneyInput } from "@/components/money-input";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { CatalogChoice, DocumentContent, PrintLine } from "@/domains/pricing/document";
import { DEFAULT_DISPLAY, documentDisplayPrice } from "@/domains/pricing/document";
import type { DocumentOutput } from "@/domains/pricing/document";
import { FOLDER_DRAG, PROMO_DRAG } from "./pricing-product-picker";
import { PageContent } from "./pricing-document-preview";

// CC-30d: 편집 화면에서만 보이는 줄 가격 출처(인쇄·공개 문서에는 안 나옴).
const SOURCE_LABEL: Record<NonNullable<PrintLine["priceSource"]>, string> = { store: "매장 가격", grade: "카탈로그가", base: "기본가", edited: "문서에서 고침" };

export function PricingDocPaper(props: { output: DocumentOutput } | React.ComponentProps<typeof EditablePricingDocPaper>) {
  if ("output" in props) return <article className="pricing-online mx-auto max-w-[860px] rounded border bg-white p-4"><PageContent data={props.output} page={1} pages={1} /></article>;
  return <EditablePricingDocPaper {...props} />;
}

/**
 * 11/4: 문서 보기 — A4 한 장처럼 보이는 편집 화면(시안 ①).
 * 품목명·단가를 종이 위에서 바로 고치고, 아래 칸에서 품목을 찾아 담습니다.
 * 품목이 많으면 1~3열 격자로, 행사·임박은 위쪽 블록(카드/표)으로 보여 줍니다.
 */
function EditablePricingDocPaper({
  baselines,
  content,
  editable,
  onContent,
  onDropProducts,
  onDropPromotions,
  onQuickAdd,
  onQuickSearch
}: {
  readonly baselines: Record<string, number>;
  readonly content: DocumentContent;
  readonly editable: boolean;
  readonly onContent: (content: DocumentContent) => void;
  readonly onDropProducts?: (ids: string[]) => void;
  readonly onDropPromotions?: (ids: string[]) => void;
  readonly onQuickAdd?: (item: CatalogChoice) => void;
  readonly onQuickSearch?: (query: string) => Promise<CatalogChoice[]>;
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
  const draggedLine = useRef<number | null>(null);
  const visiblePrice = (line: PrintLine) => documentDisplayPrice(line.price, line.taxType, display.priceIncludesTax);

  function updateLine(index: number, patch: Partial<PrintLine>) {
    onContent({ ...content, lines: content.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }
  function removeLine(index: number) {
    onContent({ ...content, lines: content.lines.filter((_, i) => i !== index) });
  }
  function dropLine(target: number) {
    if (draggedLine.current === null) return;
    // CC-35: 행사 칸 줄은 행사끼리, 일반 줄은 일반끼리만 순서가 바뀐다(다른 칸에 놓으면 무시).
    if (Boolean(content.lines[draggedLine.current]?.promotionId) !== Boolean(content.lines[target]?.promotionId)) { draggedLine.current = null; return; }
    const next = [...content.lines];
    next.splice(target, 0, next.splice(draggedLine.current, 1)[0]);
    draggedLine.current = null;
    onContent({ ...content, lines: next });
  }
  const cell = "w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-200 focus:border-teal-500 focus:bg-white disabled:hover:border-transparent";

  return (
    <article className="mx-auto w-full max-w-[860px] space-y-4 rounded-md bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.10)] sm:p-10"
      onDragOver={(event) => { if (editable && ((onDropProducts && event.dataTransfer.types.includes(FOLDER_DRAG)) || (onDropPromotions && event.dataTransfer.types.includes(PROMO_DRAG)))) event.preventDefault(); }}
      onDrop={(event) => {
        if (editable && onDropPromotions && event.dataTransfer.types.includes(PROMO_DRAG)) {
          event.preventDefault();
          try { const ids: unknown = JSON.parse(event.dataTransfer.getData(PROMO_DRAG)); if (Array.isArray(ids)) onDropPromotions(ids.filter((id): id is string => typeof id === "string").slice(0, 100)); } catch { /* 깨진 끌기 값은 무시 */ }
          return;
        }
        if (!editable || !onDropProducts || !event.dataTransfer.types.includes(FOLDER_DRAG)) return;
        event.preventDefault();
        try { const ids: unknown = JSON.parse(event.dataTransfer.getData(FOLDER_DRAG)); if (Array.isArray(ids)) onDropProducts(ids.filter((id): id is string => typeof id === "string").slice(0, 300)); } catch { /* 깨진 끌기 값은 무시 */ }
      }}
      style={{ borderTop: `6px solid ${accent}` }}>
      {/* 11/4: 문서를 주는 회사가 가장 먼저 보이도록 — 회사명 크게, 연락처·주소는 바로 아래 */}
      <header className="border-b pb-3">
        <input aria-label="회사명" className={`${cell} text-2xl font-black`} disabled={!editable} maxLength={100} onChange={(e) => onContent({ ...content, companyName: e.target.value })} placeholder="회사명을 입력하세요" style={{ color: accent }} value={content.companyName} />
        {headerInfo.length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 px-1 text-sm text-slate-700">{headerInfo.map((item) => <span key={item.key || item.label}><span className="text-slate-500">{item.label}</span> {item.value}</span>)}</div>
        ) : <p className="px-1 text-xs text-slate-400">오른쪽 &lsquo;보여줄 정보&rsquo;에서 연락처·주소 등을 넣으세요.</p>}
      </header>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex min-w-[220px] flex-1 items-center gap-2">
          <span className="shrink-0 text-slate-500">받는 곳</span>
          <input className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1" disabled={!editable} maxLength={100} onChange={(e) => onContent({ ...content, recipient: e.target.value })} placeholder={content.kind === "sheet" ? "전체 거래처" : "매장 이름"} value={content.recipient} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">유효
          <input aria-label="유효기간" className="rounded border border-slate-200 px-1 py-0.5" disabled={!editable} onChange={(e) => onContent({ ...content, validUntil: e.target.value })} type="date" value={content.validUntil} />
          까지 · 부가세 {display.priceIncludesTax ? "포함" : "별도"}
        </label>
      </div>

      {promos.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-black text-amber-900">행사·임박 {promos.length}개 <span className="font-semibold text-amber-800">· 매장 화면·인쇄에 위쪽에 나옵니다</span></p>
          {display.promoLayout === "table" ? (
            <table className="w-full table-fixed text-sm"><tbody>
              {promos.map(({ index, line }) => (
                <tr className="border-b border-amber-200" key={`${line.productId}:${line.promotionId}`} onDragOver={(event) => { if (draggedLine.current !== null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); dropLine(index); }}>
                  <td className="py-1 [overflow-wrap:anywhere]">{editable ? <span aria-hidden="true" className="shrink-0 cursor-grab px-1 text-amber-700" draggable onDragEnd={() => { draggedLine.current = null; }} onDragStart={() => { draggedLine.current = index; }} title="끌어서 행사 순서 변경">⠿</span> : null}<span className="mr-1 rounded bg-amber-200 px-1 text-xs font-bold">{line.badge || "행사"}</span>{line.displayName}<span className="block text-xs font-normal text-slate-600">{[line.spec, line.unit].filter(Boolean).join(" · ")}</span></td>
                  <td className="border-l border-amber-200 px-2 py-1 text-right font-bold [overflow-wrap:anywhere]">{visiblePrice(line).toLocaleString()}원{editable ? <a className="block text-[11px] font-normal text-teal-700 underline print:hidden" href="/revenue/pricing/promotions" rel="noopener" target="_blank">행사 화면에서 수정</a> : null}{display.showTaxType ? <span className="block text-xs font-normal text-slate-600">{line.taxType === "exempt" ? "면세" : "과세"}</span> : null}</td>
                  <td className="py-1 text-right text-xs text-slate-600">{line.endsOn ? `${line.endsOn}까지` : ""}</td>
                  <td className="w-8 py-1 text-right">{editable ? <button aria-label={`${line.displayName} 빼기`} className="text-slate-400 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}</td>
                </tr>
              ))}
            </tbody></table>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {promos.map(({ index, line }) => (
                <div className="relative rounded-md bg-white p-2" key={`${line.productId}:${line.promotionId}`} onDragOver={(event) => { if (draggedLine.current !== null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); dropLine(index); }}>
                  <p className="text-sm font-bold">{editable ? <span aria-hidden="true" className="shrink-0 cursor-grab px-1 text-amber-700" draggable onDragEnd={() => { draggedLine.current = null; }} onDragStart={() => { draggedLine.current = index; }} title="끌어서 행사 순서 변경">⠿</span> : null}<span className="mr-1 rounded bg-amber-200 px-1 text-xs">{line.badge || "행사"}</span>{line.displayName}</p>
                  <p className="text-xs text-slate-600">{line.spec} {line.unit}{line.endsOn ? ` · ${line.endsOn}까지` : ""}</p>
                  <p className="font-black text-orange-700">{visiblePrice(line).toLocaleString()}원</p>
                  {display.showTaxType ? <p className="text-xs text-slate-600">{line.taxType === "exempt" ? "면세" : "과세"}</p> : null}
                  {editable ? <button aria-label={`${line.displayName} 빼기`} className="absolute right-1.5 top-1.5 text-slate-400 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* 선택한 열 수까지 나눈다. 예전 auto-fit(260px)은 3단 편집 화면의 좁은 종이(약 490px)에서 늘 1열이었다.
          열이 150px보다 좁아지면(단가·품목명을 못 읽음) 그만큼만 줄인다. 휴대폰은 아래 media 규칙으로 1열. */}
      <div className="pricing-edit-grid grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(max(150px, calc((100% - ${columns - 1}rem) / ${columns})), 1fr))` }}>
        {chunks.map((chunk, c) => (
          <table className="w-full table-fixed border-collapse text-sm" key={c}>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="border-b py-1.5">품목{content.showSpec ? "·규격·단위" : ""}</th>
                {/* 단가 칸은 좁은 열에서도 7자리 가격이 들어가게 최소 6rem, 나머지는 품목명. */}
                {content.showPrice ? <th className="border-b px-2 py-1.5 text-right" style={{ width: `max(${100 - display.productWidth}%, 6rem)` }}>단가</th> : null}
              </tr>
            </thead>
            <tbody>
              {chunk.map(({ index, line }) => (
                <tr className={`border-b border-slate-100 ${line.visible ? "" : "opacity-40"} ${line.price < (baselines[line.productId] ?? 0) ? "bg-orange-50" : ""}`} key={`${line.productId}:${line.promotionId}`} onDragOver={(event) => { if (draggedLine.current !== null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); dropLine(index); }}>
                  <td className="py-0.5">
                    {/* 끌기 손잡이·이름·빼기를 한 줄에 둔다. 따로 둔 5% 휴지통 칸은 3열처럼 좁은 열에서 아이콘(14px)보다 좁아 칸 밖으로 넘쳤다(CC-10). */}
                    <div className="flex min-w-0 items-center">
                    {editable ? <span aria-hidden="true" className="shrink-0 cursor-grab px-1 text-slate-400" draggable onDragEnd={() => { draggedLine.current = null; }} onDragStart={() => { draggedLine.current = index; }} title="끌어서 품목 순서 변경">⠿</span> : null}
                    <input aria-label={`품목 ${index + 1} 노출 상품명`} className={`${cell} font-semibold ${line.displayName.trim() ? "" : "border-rose-300 bg-rose-50"}`} disabled={!editable} maxLength={120} onChange={(e) => updateLine(index, { displayName: e.target.value })} placeholder="품목 이름 입력" value={line.displayName} />
                    {editable ? <button aria-label={`${line.displayName} 빼기`} className="shrink-0 px-1 text-slate-300 hover:text-rose-600" onClick={() => removeLine(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                    </div>
                    {content.showBrand && line.brand ? <span className="block px-1 text-xs text-slate-500">{line.brand}</span> : null}
                    {content.showSpec && (line.spec || line.unit) ? <span className="block px-1 text-xs text-slate-600 [overflow-wrap:anywhere]" data-document-spec>{[line.spec, line.unit].filter(Boolean).join(" · ")}</span> : null}
                  </td>
                  {content.showPrice ? (
                    <td className="border-l border-slate-100 pl-2 py-1">
                      <MoneyInput ariaLabel={`품목 ${index + 1} 단가`} className={`${cell} text-right font-bold`} disabled={!editable} onCommit={(next) => { const value = next ?? 0; updateLine(index, { price: display.priceIncludesTax && line.taxType === "taxable" ? Math.round(value / 1.1) : value, priceSource: "edited" }); }} value={visiblePrice(line)} />
                      {editable && line.priceSource ? <span className="block px-1 text-right text-xs text-slate-500 print:hidden" data-price-source={line.priceSource}>{SOURCE_LABEL[line.priceSource]}</span> : null}
                      {display.showTaxType ? <span className="block px-1 text-right text-xs text-slate-600">{line.taxType === "exempt" ? "면세" : "과세"}</span> : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {editable && onQuickSearch && onQuickAdd ? (
        <QuickAdd added={new Set(content.lines.filter((l) => !l.promotionId).map((l) => l.productId))} onAdd={onQuickAdd} onSearch={onQuickSearch} />
      ) : !content.lines.length ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">왼쪽 상품 목록에서 품목을 골라 담으세요.</p> : null}

      <style>{`@media screen and (max-width:640px){.pricing-edit-grid{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <footer className="space-y-1 border-t pt-3 text-xs text-slate-700">
        {footerInfo.length ? <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">{footerInfo.map((item) => <p key={item.key || item.label}>{item.label} · {item.value}</p>)}</div> : null}
        <textarea aria-label="하단 안내" className="w-full resize-y rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-teal-500" disabled={!editable} maxLength={400} onChange={(e) => onContent({ ...content, footer: e.target.value })} placeholder="하단에 넣을 문구 (예: 시세 품목은 경매가에 따라 달라질 수 있습니다)" rows={2} value={content.footer} />
      </footer>
    </article>
  );
}

/**
 * 11/4: 종이 안 '+ 품목 추가' — 이름을 치면 바로 후보가 뜨고, 엔터로 담은 뒤 입력칸이 비워져 다음 품목을 이어서 칩니다.
 * ↑↓로 후보를 고르고, Esc로 닫습니다.
 */
function QuickAdd({ added, onAdd, onSearch }: {
  readonly added: ReadonlySet<string>;
  readonly onAdd: (item: CatalogChoice) => void;
  readonly onSearch: (query: string) => Promise<CatalogChoice[]>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogChoice[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const addedRef = useRef(added);
  addedRef.current = added;
  // 11/4: ↑↓·엔터가 이미 담은 품목은 건너뜁니다.
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < results.length; i += dir) if (!added.has(results[i].id)) return i;
    return from;
  };
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void onSearch(q).then((items) => { if (alive) { const list = items.slice(0, 8); setResults(list); setActive(Math.max(0, list.findIndex((item) => !addedRef.current.has(item.id)))); } }).catch(() => { if (alive) setResults([]); }).finally(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query, onSearch]);
  function pick(item: CatalogChoice | undefined) {
    if (!item) { setNote(query.trim() ? "맞는 상품이 없습니다. 이름을 조금 줄여 보세요." : ""); return; }
    if (added.has(item.id)) { setNote(`${item.displayName || item.name}은(는) 이미 담겨 있습니다.`); return; }
    onAdd(item);
    setNote(`${item.displayName || item.name} 담음`);
    setQuery("");
    setResults([]);
    input.current?.focus();
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-teal-500 bg-teal-50/40 px-3 py-2">
        <span className="font-black text-teal-700">+</span>
        <input
          aria-label="문서에 품목 바로 추가"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          maxLength={100}
          onChange={(e) => { setQuery(e.target.value); setNote(""); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => step(i, 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => step(i, -1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (!e.nativeEvent.isComposing) pick(results[active]); }
            else if (e.key === "Escape") { setResults([]); }
          }}
          placeholder="품목 추가 — 이름을 치고 엔터 (↑↓로 고르기)"
          ref={input}
          value={query}
        />
        <span className="shrink-0 text-xs text-slate-500">{loading ? "찾는 중" : note}</span>
      </div>
      {results.length ? (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {results.map((item, index) => (
            <li aria-selected={index === active} key={item.id} role="option">
              <button className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${index === active ? "bg-teal-50" : ""} ${added.has(item.id) ? "text-slate-400" : ""}`} onClick={() => pick(item)} onMouseEnter={() => setActive(index)} type="button">
                <span className="min-w-0 flex-1 truncate font-semibold">{item.displayName || item.name}</span>
                <span className="text-xs text-slate-500">{item.spec} {item.unit}</span>
                <span className="w-20 text-right font-bold">{item.price.toLocaleString()}원</span>
                {added.has(item.id) ? <span className="text-xs">담김</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

