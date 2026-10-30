"use client";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  documentOutput,
  printPages,
  koreaDay,
  type DocumentVersion,
  type DocumentOutput,
} from "@/domains/pricing/document";
function PageContent({
  data,
  page,
  pages,
  start = 0,
}: {
  data: DocumentOutput;
  page: number;
  pages: number;
  start?: number;
}) {
  const accent =
    data.theme === "blue"
      ? "#1d4ed8"
      : data.theme === "green"
        ? "#047857"
        : "#1f2937";
  return (
    <div
      className="pricing-output-content"
      style={{ borderTop: `6px solid ${accent}` }}
    >
      <header className="space-y-2 border-b pb-4">
        <p className="font-semibold" style={{ color: accent }}>
          {data.companyName}
        </p>
        <h2 className="text-2xl font-bold">{data.title}</h2>
        <p>
          {data.version ? `버전 ${data.version}` : "작성 중 미리보기"} · 발행일{" "}
          {koreaDay(new Date(data.publishedAt))} · 유효기간 {data.validUntil}
          {data.expired ? " 만료" : "까지"}
        </p>
        {data.recipient && <p>받는 곳: {data.recipient}</p>}
        <p>{data.contact}</p>
        <p className="text-sm">부가세 별도 · 면세 품목 별도 표시</p>
        {data.expired && (
          <p className="font-semibold text-red-700">
            유효기간이 지나 가격을 표시하지 않습니다.
          </p>
        )}
      </header>
      {data.layout === "cards" ? (
        <div className="my-4 grid grid-cols-2 gap-3">
          {data.lines.map((l, i) => (
            <article key={i} className="min-h-36 space-y-2 rounded border p-3">
              <h3 className="font-bold">
                {l.badge && (
                  <span className="mr-1 rounded bg-amber-100 px-1 text-amber-900">
                    {l.badge}
                  </span>
                )}
                {l.displayName}
              </h3>
              {l.brand && <p>{l.brand}</p>}
              <p>
                {l.spec} {l.unit}
              </p>
              {l.price !== null && (
                <p className="text-lg font-bold">
                  {l.price.toLocaleString()}원
                </p>
              )}
              <p className="text-xs">
                {l.taxType === "exempt" ? "면세" : "과세"}
                {l.endsOn ? ` · ${l.endsOn}까지` : ""}
                {l.remaining !== null ? ` · 남은 수량 ${l.remaining}` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <table className="my-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {["No", "품목·브랜드", "규격·단위", "단가", "비고"].map((t) => (
                <th key={t} className="border-b-2 p-2">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td className="border-b p-2">{start + i + 1}</td>
                <td className="border-b p-2 font-semibold">
                  {l.badge && (
                    <span className="mr-1 rounded bg-amber-100 px-1">
                      {l.badge}
                    </span>
                  )}
                  {l.displayName}
                  <span className="block font-normal">{l.brand}</span>
                </td>
                <td className="border-b p-2">
                  {l.spec} {l.unit}
                </td>
                <td className="border-b p-2">
                  {l.price !== null ? `${l.price.toLocaleString()}원` : "—"}
                </td>
                <td className="border-b p-2 text-xs">
                  {l.taxType === "exempt" ? "면세" : "과세"}
                  {l.endsOn && <span className="block">{l.endsOn}까지</span>}
                  {l.remaining !== null && (
                    <span className="block">남은 수량 {l.remaining}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!data.lines.length && (
        <p className="py-8">표시 가능한 품목이 없습니다.</p>
      )}
      <footer className="mt-auto space-y-2 border-t pt-3 text-sm">
        <p className="whitespace-pre-wrap">{data.footer}</p>
        <p>{data.contact}</p>
        <p className="text-right">
          {page} / {pages}쪽
        </p>
      </footer>
    </div>
  );
}
export function PricingDocumentPreview({
  version,
  refresh,
}: {
  version: DocumentVersion;
  refresh?: () => Promise<DocumentVersion>;
}) {
  const [current, setCurrent] = useState(version),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [day, setDay] = useState(koreaDay());
  const papers = useRef<Array<HTMLDivElement | null>>([]);
  const output = documentOutput(current, day),
    pages = printPages(output);
  async function prepare() {
    const latest = refresh ? await refresh() : version;
    flushSync(() => {
      setCurrent(latest);
      setDay(koreaDay());
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return latest;
  }
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
        <button
          disabled={busy}
          className="rounded border px-3 py-2"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await prepare();
              window.print();
            } catch (e) {
              setError(e instanceof Error ? e.message : "인쇄할 수 없습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          PDF·인쇄
        </button>
        <span className="text-sm text-slate-600">
          PNG는 A4 페이지별로 저장합니다.
        </span>
      </div>
      {error && (
        <p role="alert" className="pricing-no-print text-red-700">
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <div className="pricing-no-print">
          <h3 className="mb-2 font-semibold">온라인 · 휴대폰</h3>
          <div className="max-w-[390px] rounded-2xl border bg-white p-3 shadow">
            <PageContent data={output} page={1} pages={1} />
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
                      page={i + 1}
                      pages={pages.length}
                      start={pages
                        .slice(0, i)
                        .reduce((n, p) => n + p.lines.length, 0)}
                    />
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => void exportPage(i)}
                    className="pricing-no-print my-3 rounded border px-3 py-2"
                  >
                    {i + 1}쪽 PNG 저장
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`.pricing-paper{width:210mm;min-height:297mm;height:297mm;padding:14mm;box-sizing:border-box;color:#111827}.pricing-output-content{min-height:260mm;display:flex;flex-direction:column;overflow-wrap:anywhere}.pricing-output-content th{position:sticky;top:0;background:white}.pricing-paper table{font-size:11px;line-height:16px}.pricing-paper td{max-width:65mm}.pricing-paper header{font-size:11px;line-height:16px}.pricing-paper h2{font-size:20px;line-height:24px}.pricing-paper h3{font-size:14px;line-height:18px}.pricing-paper footer{font-size:11px;line-height:16px}@page{size:A4;margin:0}@media print{body *{visibility:hidden!important}#pricing-print-root,#pricing-print-root *{visibility:visible!important}#pricing-print-root{position:absolute;left:0;top:0;width:210mm}#pricing-print-root .pricing-no-print{display:none!important}.pricing-paper{box-shadow:none!important;break-after:page;page-break-after:always}.pricing-no-print{display:none!important}.pricing-output-content th{position:static}}`}</style>
    </section>
  );
}
