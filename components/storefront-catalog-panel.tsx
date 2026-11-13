"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lastDispatchLabel, type CatalogLine } from "@/domains/pricing/storefront-catalog";

// CC-36a: 매장 주문 탭의 "전체 상품"(읽기 전용, 주문은 36c). 가격은 서버가 준 값만 보여 준다.
export type CatalogPage = { lines: CatalogLine[]; page: number; hasMore: boolean; marketPriceNotice: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export async function fetchCatalogPage(token: string, page: number, q: string): Promise<CatalogPage | null> {
  try {
    const response = await fetch("/api/storefront/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, page, q }) });
    return response.ok ? await response.json() as CatalogPage : null;
  } catch { return null; }
}

/** 받은 단가표 | 전체 상품 전환(전체 상품 링크가 있는 매장만 보임). */
export function SourceToggle({ source, onChange }: { source: "doc" | "all"; onChange: (next: "doc" | "all") => void }) {
  return <div aria-label="상품 보기" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm font-bold" role="group">
    {([["doc", "받은 단가표"], ["all", "전체 상품"]] as const).map(([key, label]) => <button aria-pressed={source === key} className={`min-h-[44px] px-4 ${source === key ? "bg-blue-700 text-white" : "bg-white text-slate-700"}`} key={key} onClick={() => onChange(key)} type="button">{label}</button>)}
  </div>;
}

export function StorefrontCatalogPanel({ token, initial }: { token: string; initial: CatalogPage }) {
  const [lines, setLines] = useState<CatalogLine[]>(initial.lines);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage: number, query: string, append: boolean) => {
    setBusy(true); setError("");
    const result = await fetchCatalogPage(token, nextPage, query);
    setBusy(false);
    if (!result) { setError("전체 상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."); return; }
    setLines((current) => (append ? [...current, ...result.lines] : result.lines)); setPage(result.page); setHasMore(result.hasMore);
  }, [token]);
  useEffect(() => { const timer = setTimeout(() => { if (q !== "") void load(1, q, false); }, 300); return () => clearTimeout(timer); }, [q, load]);

  const categories = useMemo(() => Array.from(new Set(lines.map((line) => line.category))).sort((a, b) => a.localeCompare(b, "ko")), [lines]);
  const shown = category ? lines.filter((line) => line.category === category) : lines;

  const priceCell = (line: CatalogLine) => line.isMarket
    ? <div className="text-right text-sm">
        <p className="font-semibold text-amber-900">시세 · 가격 미정</p>
        {line.todayBasePrice !== null ? <p className="text-xs">오늘 기준가 <b>{won(line.todayBasePrice)}</b></p> : null}
        {line.lastDispatch ? <p className="text-xs text-slate-600">{lastDispatchLabel(line.lastDispatch)}</p> : null}
        <p className="text-xs text-amber-800">{initial.marketPriceNotice}</p>
      </div>
    : <p className="text-right text-base font-bold">{line.price !== null ? won(line.price) : "가격 확인 필요"}</p>;

  return <section aria-label="전체 상품" className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="상품 검색" className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" onChange={(e) => setQ(e.target.value)} placeholder="상품 이름 검색" type="search" value={q} />
      <div aria-label="보기" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm font-bold" role="group">{(["cards", "table"] as const).map((v) => <button aria-pressed={view === v} className={`min-h-[44px] px-3 ${view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`} key={v} onClick={() => setView(v)} type="button">{v === "cards" ? "카드" : "표"}</button>)}</div>
    </div>
    {categories.length > 1 ? <div aria-label="분류" className="flex flex-wrap gap-1.5" role="group">
      <button aria-pressed={category === ""} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${category === "" ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 text-slate-700"}`} onClick={() => setCategory("")} type="button">전체</button>
      {categories.map((c) => <button aria-pressed={category === c} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${category === c ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 text-slate-700"}`} key={c} onClick={() => setCategory(c)} type="button">{c}</button>)}
    </div> : null}
    {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
    <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600" role="status">전체 상품 주문은 준비 중입니다. 지금은 가격만 확인할 수 있습니다.</p>
    <ul className={view === "table" ? "grid gap-1" : "grid gap-2 md:grid-cols-2 xl:grid-cols-3"}>{shown.map((line) => <li className={`rounded-lg border border-slate-200 bg-white p-3 ${view === "table" ? "md:grid md:grid-cols-[minmax(0,1fr)_260px] md:items-center md:gap-3" : ""}`} key={line.productId}>
      <div className="min-w-0"><p className="truncate font-semibold">{line.name}</p><p className="truncate text-xs text-slate-500">{[line.brand, line.spec, line.unit].filter(Boolean).join(" · ")}</p></div>
      <div className="mt-2 md:mt-0">{priceCell(line)}</div>
    </li>)}{!shown.length ? <li className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{busy ? "불러오는 중…" : "조건에 맞는 상품이 없습니다."}</li> : null}</ul>
    {hasMore ? <button className="min-h-[44px] w-full rounded-lg border border-slate-300 text-sm font-bold" disabled={busy} onClick={() => void load(page + 1, q, true)} type="button">{busy ? "불러오는 중…" : "더 보기"}</button> : null}
  </section>;
}
