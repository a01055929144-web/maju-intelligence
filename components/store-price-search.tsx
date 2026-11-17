"use client";

import { useEffect, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { MobileListRow } from "./ui/mobile/mobile-list-row";
import { MoneyText } from "./ui/mobile/money-text";
import { SearchInput } from "./ui/search-input";
import { EmptyState, ErrorState, LoadingState } from "./ui/state";
import { formatWon } from "@/domains/shared/money";
import type { StorePriceKind, StorePricePage, StorePriceRow } from "@/domains/pricing/store-price-search";

const labels: Record<StorePriceKind, string> = { sheet: "받은 단가표", quote: "받은 견적서", catalog: "전체 상품" };
const priceText = (row: StorePriceRow) => row.price !== null ? formatWon(row.price)
  : row.recent ? `최근 출고가 ${row.recent.date.slice(5).replace("-", "/")} ${formatWon(row.recent.price)} (참고)` : "단가 문의";
const columns: CommonTableColumn<StorePriceRow>[] = [
  { key: "name", label: "품목", value: row => row.name, sortable: true },
  { key: "spec", label: "규격", value: row => row.spec },
  { key: "unit", label: "단위", value: row => row.unit },
  { key: "price", label: "단가", value: priceText, align: "right" },
];

export function StorePriceSearch({ companyId, storeAccountId, documents }: {
  companyId: string;
  storeAccountId: string;
  documents: Array<{ key: string; title: string; kind: "sheet" | "quote" }>;
}) {
  const [kind, setKind] = useState<StorePriceKind>("sheet");
  const [documentKey, setDocumentKey] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<StorePricePage | null>(null);
  const [error, setError] = useState<"forbidden" | "read" | null>(null);
  const available = documents.filter(doc => doc.kind === kind);
  const requested = available.find(doc => doc.key === documentKey)?.key ?? available[0]?.key;
  const hasSource = kind === "catalog" || Boolean(requested);
  useEffect(() => {
    if (!hasSource) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ companyId, storeAccountId, kind, page: String(page), q: query });
        if (requested) params.set("document", requested);
        const response = await fetch(`/api/store/price-search?${params}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) {
          if (!abort.signal.aborted) setError(response.status === 401 || response.status === 403 || response.status === 404 ? "forbidden" : "read");
          return;
        }
        const data = await response.json() as StorePricePage;
        if (!abort.signal.aborted) setResult(data);
      } catch {
        if (!abort.signal.aborted) setError("read");
      }
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [attempt, companyId, hasSource, kind, page, query, requested, storeAccountId]);

  function reset(nextPage = 1) {
    setResult(null);
    setError(null);
    setPage(nextPage);
  }
  return <section aria-labelledby="store-price-search-title" className="min-w-0 space-y-3">
    <h3 id="store-price-search-title" className="text-lg font-semibold">품목 단가 확인</h3>
    <div role="group" aria-label="가격 출처" className="flex flex-wrap gap-2">
      {(["sheet", "quote", "catalog"] as const).map(value =>
        <button key={value} type="button" aria-pressed={kind === value}
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${kind === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-700"}`}
          onClick={() => { if (kind === value) return; setKind(value); setDocumentKey(""); reset(); }}>{labels[value]}</button>)}
    </div>
    {available.length > 0 && <label className="block text-sm font-medium">문서
      <select value={requested} onChange={event => { setDocumentKey(event.target.value); reset(); }}
        className="mt-1 block min-h-11 w-full rounded-lg border px-3 text-base">
        {available.map(doc => <option key={doc.key} value={doc.key}>{doc.title}</option>)}
      </select>
    </label>}
    <SearchInput aria-label="품목명 또는 규격 검색" placeholder="품목명 또는 규격 검색"
      inputProps={{ maxLength: 60 }} value={query} onChange={value => { setQuery(value); reset(); }} />
    {!hasSource ? <EmptyState bare message={`${labels[kind]}가 없습니다.`} />
      : error ? <div className="space-y-2">
        <ErrorState bare message={error === "forbidden" ? "이 매장의 단가를 볼 수 없습니다." : "단가를 불러오지 못했습니다."} />
        {error === "read" && <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => { reset(page); retry(attempt + 1); }}>다시 시도</button>}
      </div> : !result ? <LoadingState bare label="단가를 불러오는 중입니다." />
      : result.rows.length === 0 ? <EmptyState bare message="검색 조건에 맞는 품목이 없습니다." />
      : <>
        <div className="hidden md:block"><CommonDataTable rows={result.rows} columns={columns} rowKey={row => row.id}
          settingsKey="store-price-search" /></div>
        <ul aria-label="품목 단가" className="md:hidden">{result.rows.map(row => <li key={row.id}>
          <MobileListRow title={row.name} subtitle={[row.spec, row.unit].filter(Boolean).join(" · ")}
            trailing={row.price !== null ? <MoneyText value={row.price} />
              : row.recent ? <span className="block text-[13px]">최근 출고가 {row.recent.date.slice(5).replace("-", "/")}<br /><MoneyText value={row.recent.price} /> (참고)</span>
                : "단가 문의"} />
        </li>)}</ul>
      </>}
    {result && (page > 1 || result.hasMore) && <div className="flex justify-between gap-2">
      <button type="button" disabled={page === 1} onClick={() => reset(page - 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">이전</button>
      <button type="button" disabled={!result.hasMore} onClick={() => reset(page + 1)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">다음</button>
    </div>}
  </section>;
}
