"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  documentOutput,
  refreshedDocumentVersion,
  printPages,
  koreaDay,
  type DocumentVersion,
  type DocumentOutput,
} from "@/domains/pricing/document";
import { PricingDocumentOrderQr, type DocumentOrderQr } from "./pricing-document-order-qr";
import { documentLinkLastDay } from "@/domains/pricing/document-share";
import { Button } from "./ui/button";

type OutputLine = DocumentOutput["lines"][number];

/** 11/4: A4·휴대폰·편집 미리보기가 모두 쓰는 한 장. 회사 정보 줄, 행사 블록(카드/표), 품목 격자(1~3열). */
export function PageContent({
  data,
  page,
  pages,
  start = 0,
  qr,
}: {
  data: DocumentOutput;
  page: number;
  pages: number;
  start?: number;
  qr?: DocumentOrderQr | null;
}) {
  const accent =
    data.theme === "blue"
      ? "#1d4ed8"
      : data.theme === "green"
        ? "#047857"
        : "#1f2937";
  const display = data.display;
  const headerInfo = display.info.filter((item) => item.place === "header");
  const footerInfo = display.info.filter((item) => item.place === "footer");
  const promos = data.lines.filter((l) => l.badge);
  const regular = data.lines.filter((l) => !l.badge);
  const columns = Math.max(1, Math.min(3, display.columns || 1));
  const perColumn = Math.ceil(regular.length / columns) || 0;
  const chunks = Array.from({ length: columns }, (_, i) => regular.slice(i * perColumn, (i + 1) * perColumn)).filter((chunk) => chunk.length);
  const price = (l: OutputLine) => (l.price !== null ? `${l.price.toLocaleString()}원` : "—");
  return (
    <div
      className="pricing-output-content"
      style={{ borderTop: `6px solid ${accent}` }}
    >
      <header className="space-y-1.5 border-b pb-3">
        {/* 11/4: 문서를 주는 회사가 먼저 눈에 들어오도록 회사명을 가장 크게 */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-black leading-tight" style={{ color: accent }}>
              {data.companyName}
            </p>
            {headerInfo.length ? (
              <p className="mt-0.5 text-xs text-slate-700">{headerInfo.map((item) => `${item.label} ${item.value}`).join(" · ")}</p>
            ) : null}
          </div>
          <div className="text-right text-xs">
            <p className="text-base font-bold">{data.title}</p>
            <p>
              {data.version ? `버전 ${data.version}` : "작성 중"} · 발행 {koreaDay(new Date(data.publishedAt))} · 유효 {data.validUntil}
              {data.expired ? " 만료" : "까지"}
            </p>
          </div>
        </div>
        {data.recipient && <p>받는 곳: {data.recipient}</p>}
        {data.contact && <p className="text-xs">{data.contact}</p>}
        <p className="text-xs">{display.priceIncludesTax ? "과세 품목 부가세 포함" : "부가세 별도"} · 면세 품목 별도 표시</p>
        {data.expired && (
          <p className="font-semibold text-red-700">
            유효기간이 지나 가격을 표시하지 않습니다.
          </p>
        )}
      </header>
      {promos.length ? (
        <section className="my-3 rounded border border-amber-300 bg-amber-50 p-2">
          <p className="mb-1.5 text-xs font-bold text-amber-900">행사·임박 상품</p>
          {display.promoLayout === "table" ? (
            <table className="pricing-output-table w-full table-fixed border-collapse text-left">
              <tbody>
                {promos.map((l, i) => (
                  <tr key={i}>
                    <td className="border-b border-amber-200 p-1 [overflow-wrap:anywhere]"><span className="mr-1 rounded bg-amber-200 px-1">{l.badge}</span>{l.displayName}<span data-document-spec className="block text-xs text-slate-600">{[l.spec, l.unit].filter(Boolean).join(" · ")}</span></td>
                    <td className="border-b border-amber-200 p-1 text-right font-bold">{price(l)}<span data-document-tax className="block text-xs font-normal">{l.taxType === "exempt" ? "면세" : "과세"}</span></td>
                    <td className="border-b border-amber-200 p-1 text-xs">{l.endsOn ? `${l.endsOn}까지` : ""}{l.remaining !== null ? ` · 남은 ${l.remaining}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {promos.map((l, i) => (
                <article key={i} className="rounded bg-white p-2">
                  <p className="font-bold"><span className="mr-1 rounded bg-amber-200 px-1 text-xs">{l.badge}</span>{l.displayName}</p>
                  <p className="text-xs">{l.spec} {l.unit}</p>
                  <p className="font-bold">{price(l)}</p>
                  <p data-document-tax className="text-xs">{l.taxType === "exempt" ? "면세" : "과세"}</p>
                  <p className="text-xs">{l.endsOn ? `${l.endsOn}까지` : ""}{l.remaining !== null ? ` · 남은 ${l.remaining}` : ""}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {data.layout === "cards" ? (
        <div className="my-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns + 1}, minmax(0, 1fr))` }}>
          {regular.map((l, i) => (
            <article key={i} className="space-y-1 rounded border p-2">
              <h3 className="font-bold">{l.displayName}</h3>
              {l.brand && <p className="text-xs">{l.brand}</p>}
              <p className="text-xs">
                {l.spec} {l.unit}
              </p>
              {l.price !== null && <p className="font-bold">{price(l)}</p>}
              <p data-document-tax className="text-xs">{l.taxType === "exempt" ? "면세" : "과세"}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="pricing-output-grid my-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${chunks.length || 1}, minmax(0, 1fr))` }}>
          {chunks.map((chunk, c) => (
            <table className="pricing-output-table w-full table-fixed border-collapse text-left" key={c}>
              <colgroup>{(columns === 1 ? [6, display.productWidth * 0.83, (100 - display.productWidth) * 0.83, 11] : [display.productWidth, 100 - display.productWidth]).map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
              <thead>
                <tr>
                  {(columns === 1 ? ["No", "품목·규격·단위", "단가", "비고"] : ["품목·규격·단위", "단가"]).map((t) => (
                    <th key={t} className="border-b-2 p-1.5">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chunk.map((l, i) => (
                  <tr key={i}>
                    {columns === 1 ? <td className="border-b p-1.5">{start + c * perColumn + i + 1}</td> : null}
                    <td className="min-w-0 border-b p-1.5 font-semibold [overflow-wrap:anywhere]">
                      <span className="block">{l.displayName}</span>
                      {l.brand ? <span className="block font-normal text-xs">{l.brand}</span> : null}
                      {l.spec || l.unit ? <span data-document-spec className="block font-normal text-xs text-slate-600 [overflow-wrap:anywhere]">{[l.spec, l.unit].filter(Boolean).join(" · ")}</span> : null}
                      {columns !== 1 ? <span data-document-tax className="block font-normal text-xs">{l.taxType === "exempt" ? "면세" : "과세"}</span> : null}
                    </td>
                    <td data-document-price className="border-b border-l px-1.5 py-1.5 text-right tabular-nums [overflow-wrap:anywhere]"><span data-document-price-value>{price(l)}</span></td>
                    {columns === 1 ? <td data-document-tax className="border-b p-1.5 text-xs">{l.taxType === "exempt" ? "면세" : "과세"}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}
      {!data.lines.length && (
        <p className="py-8">표시 가능한 품목이 없습니다.</p>
      )}
      <footer className="mt-auto space-y-1.5 border-t pt-3 text-sm">
        {qr ? <div className="flex items-center gap-3"><img src={qr.dataUrl} width={128} height={128} alt={`${qr.customerName} 주문 링크 QR`} className="h-32 w-32 shrink-0" /><p className="text-xs"><strong>{qr.customerName}</strong><br />{qr.audience === "public" ? "QR로 문서를 열고 주문·가입을 시작하세요." : "QR을 스캔해 주문하세요. 이 거래처에만 전달해 주세요."}{qr.audience === "public" && qr.expiresAt ? <><br />가격·주문: {data.validUntil}까지<br />QR 품목 열람: {documentLinkLastDay(qr.expiresAt)}까지</> : null}</p></div> : null}
        {footerInfo.length ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
            {footerInfo.map((item) => <p key={`${item.label}-${item.value}`}>{item.label} · {item.value}</p>)}
          </div>
        ) : null}
        {data.footer ? <p className="whitespace-pre-wrap">{data.footer}</p> : null}
        <p className="text-right text-xs">
          {page} / {pages}쪽
        </p>
      </footer>
    </div>
  );
}

export function PricingDocumentPreview({
  version,
  refresh,
  fontScale = 1,
  autoPrint = false,
  companyId,
  canManageLinks = false,
  publicSharingAvailable = false,
  openPublicQr = false,
}: {
  version: DocumentVersion;
  refresh?: () => Promise<DocumentVersion>;
  /** 11/4: 글자 크기 100%·115%·130% */
  fontScale?: number;
  /** 11/4: 상단 'A4 인쇄'로 열었을 때 바로 인쇄 창 */
  autoPrint?: boolean;
  companyId?: string;
  canManageLinks?: boolean;
  publicSharingAvailable?: boolean;
  openPublicQr?: boolean;
}) {
  const [current, setCurrent] = useState(version),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [day, setDay] = useState(koreaDay());
  const [qr, setQr] = useState<DocumentOrderQr | null>(null);
  const papers = useRef<Array<HTMLDivElement | null>>([]);
  const output = documentOutput(current, day),
    pages = printPages(output, fontScale, Boolean(qr));
  const alive = useRef(false), autoPrinted = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const cutoff = Date.parse(`${current.content.validUntil}T15:00:00Z`);
    if (cutoff <= Date.now()) return;
    const timer = window.setTimeout(() => setDay(koreaDay()), Math.min(2147483647, cutoff - Date.now()));
    return () => window.clearTimeout(timer);
  }, [current.content.validUntil, day]);
  const prepare = useCallback(async () => {
    const latest = refreshedDocumentVersion(version, refresh ? await refresh() : version);
    if (!alive.current) throw new Error("미리보기를 다시 열어 주세요.");
    flushSync(() => {
      setCurrent(latest);
      setDay(koreaDay());
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return latest;
  }, [refresh, version]);
  const printDocument = useCallback(async () => {
    autoPrinted.current = true;
    setBusy(true); setError("");
    try { await prepare(); if (alive.current) window.print(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "인쇄할 수 없습니다."); }
    finally { if (alive.current) setBusy(false); }
  }, [prepare]);
  useEffect(() => {
    if (!autoPrint || autoPrinted.current) return;
    const timer = window.setTimeout(() => { if (!autoPrinted.current) void printDocument(); }, 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, printDocument]);
  async function exportPage(index: number) {
    setBusy(true);
    setError("");
    try {
      await prepare();
      const paper = papers.current[index];
      if (!paper) throw new Error("페이지를 확인해 주세요.");
      const { toPng } = await import("html-to-image");
      const url = await toPng(paper, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        skipFonts: true,
      });
      const a = document.createElement("a");
      a.download = `document-v${current.version}-${index + 1}.png`;
      a.href = url;
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-label="온라인·오프라인 미리보기">
      <div className="pricing-no-print flex flex-wrap items-center gap-3">
        <h2 className="font-bold">온라인·오프라인 미리보기</h2>
        <Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={() => void printDocument()}>PDF·인쇄</Button>
        <span className="text-sm text-slate-600">
          PNG는 A4 페이지별로 저장합니다.
        </span>
      </div>
      {companyId && (canManageLinks || publicSharingAvailable) && current.version > 0 ? <PricingDocumentOrderQr key={current.id} companyId={companyId} version={current} publicSharingAvailable={publicSharingAvailable} allowCustomerLink={canManageLinks} initiallyOpen={openPublicQr && publicSharingAvailable} onInsert={setQr} /> : null}
      {error && (
        <p role="alert" className="pricing-no-print text-red-700">
          {error} 같은 버튼으로 다시 시도하거나 미리보기를 닫고 버전을 다시 선택해 주세요.
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="pricing-no-print">
          <h3 className="mb-2 font-semibold">온라인 · 휴대폰</h3>
          <div className="pricing-online max-w-[390px] rounded-2xl border bg-white p-3 shadow">
            <PageContent data={output} page={1} pages={1} qr={qr} />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="pricing-no-print mb-2 font-semibold">오프라인 · A4</h3>
          <div className="overflow-x-auto">
            <div id="pricing-print-root">
              {pages.map((data, i) => (
                <div key={i}>
                  <div
                    className="pricing-paper bg-white shadow"
                    ref={(element) => {
                      papers.current[i] = element;
                    }}
                  >
                    <PageContent
                      data={data}
                      qr={qr}
                      page={i + 1}
                      pages={pages.length}
                      start={pages
                        .slice(0, i)
                        .reduce((n, p) => n + p.lines.length, 0)}
                    />
                  </div>
                  <Button
                    variant="outline" disabled={busy}
                    onClick={() => void exportPage(i)}
                    className="pricing-no-print my-3 min-h-[44px]"
                  >
                    {i + 1}쪽 PNG 저장
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`.pricing-paper{width:210mm;min-height:297mm;height:297mm;padding:10mm;box-sizing:border-box;color:#111827}.pricing-paper .pricing-output-content{min-height:277mm}.pricing-output-content{min-height:260mm;display:flex;flex-direction:column;overflow-wrap:anywhere}.pricing-output-content th{position:sticky;top:0;background:white}.pricing-paper table{font-size:${Math.round(12 * fontScale)}px;line-height:${Math.round(16 * fontScale)}px}.pricing-paper table .text-xs{font-size:inherit;line-height:inherit}.pricing-paper .pricing-output-table td,.pricing-paper .pricing-output-table th{padding:3px 4px}.pricing-paper [data-document-price]{font-size:${Math.round(11 * fontScale)}px}.pricing-paper .pricing-output-grid{gap:3mm;margin-top:3mm;margin-bottom:3mm}.pricing-paper footer img{width:30mm;height:30mm}.pricing-output-table td,.pricing-output-table th{min-width:0;overflow-wrap:anywhere;word-break:normal}.pricing-online .pricing-output-content{min-height:0}.pricing-online .pricing-output-grid{grid-template-columns:minmax(0,1fr)!important}.pricing-paper header{font-size:${Math.round(11 * fontScale)}px;line-height:${Math.round(16 * fontScale)}px}.pricing-paper h2{font-size:${Math.round(20 * fontScale)}px;line-height:${Math.round(24 * fontScale)}px}.pricing-paper h3{font-size:14px;line-height:18px}.pricing-paper footer{font-size:11px;line-height:16px}@page{size:A4;margin:0}@media print{body *{visibility:hidden!important}#pricing-print-root,#pricing-print-root *{visibility:visible!important}#pricing-print-root{position:absolute;left:0;top:0;width:210mm}#pricing-print-root .pricing-no-print{display:none!important}.pricing-paper{box-shadow:none!important;break-after:page;page-break-after:always}.pricing-no-print{display:none!important}#pricing-print-root>div:last-child .pricing-paper{break-after:auto;page-break-after:auto}.pricing-output-content th{position:static}}`}</style>
    </section>
  );
}
