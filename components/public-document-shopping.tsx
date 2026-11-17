"use client";

import { useEffect, useState } from "react";
import type { PublicDocumentOutput } from "@/domains/pricing/document-share";
import { formatWon } from "@/domains/shared/money";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { MobileListRow, MoneyText } from "./ui/mobile";
import { SearchInput } from "./ui/search-input";

export type ShoppingRow = PublicDocumentOutput["lines"][number] & { itemKey: string | null; rowKey: number };

export function PublicShoppingRows({ rows, quantities, change }: {
  rows: ShoppingRow[];
  quantities: Record<string, number>;
  change: (key: string, quantity: number) => void;
}) {
  const quantity = (row: ShoppingRow) => row.itemKey ? quantities[row.itemKey] ?? 0 : 0;
  const control = ({ itemKey, displayName }: ShoppingRow) => {
    if (!itemKey) return null;
    const value = quantities[itemKey] ?? 0;
    return <div className="inline-flex items-center gap-1">
      <Button type="button" variant="outline" className="min-h-[44px] min-w-[44px] px-2" aria-label={`${displayName} 수량 줄이기`}
        disabled={value === 0} onClick={() => change(itemKey, value - 1)}>−</Button>
      <input type="text" inputMode="numeric" aria-label={`${displayName} 수량`} className="h-11 w-12 rounded border text-center"
        value={value || ""} placeholder="0" onChange={event => { if (/^\d{0,4}$/.test(event.target.value)) change(itemKey, Number(event.target.value)); }} />
      <Button type="button" variant="outline" className="min-h-[44px] min-w-[44px] px-2" aria-label={`${displayName} 수량 늘리기`}
        disabled={value >= 9999} onClick={() => change(itemKey, value + 1)}>＋</Button>
    </div>;
  };
  const columns: CommonTableColumn<ShoppingRow>[] = [
    { key: "name", label: "품목", value: row => row.displayName, render: row => <>{row.displayName}{row.badge && <span className="ml-2 text-xs">{row.badge}</span>}</> },
    { key: "spec", label: "규격 · 단위", value: row => [row.spec, row.unit].filter(Boolean).join(" · ") },
    { key: "price", label: "단가", align: "right", value: row => row.price === null ? "—" : formatWon(row.price) },
    { key: "quantity", label: "수량", value: quantity, editor: {
      type: "number", min: 0, max: 9999, integer: true, ariaLabel: row => `${row.displayName} 수량`,
      disabled: row => !row.itemKey, onChange: (row, value) => { if (row.itemKey) change(row.itemKey, value ?? 0); },
    } },
    { key: "total", label: "합계", align: "right", value: row => row.price === null || !quantity(row) ? "—" : formatWon(Math.round(row.price * quantity(row))) },
  ];
  return <div className="print:hidden">
    <div className="hidden md:block"><CommonDataTable rows={rows} columns={columns} rowKey={row => String(row.rowKey)} settingsKey="cx70-public-document" /></div>
    <ul aria-label="단가표 품목" className="rounded border bg-white md:hidden">{rows.map(row => <li key={row.rowKey}>
      <MobileListRow title={row.displayName} subtitle={[row.spec, row.unit, row.badge].filter(Boolean).join(" · ")}
        trailing={row.price !== null && <MoneyText value={row.price} />} />
      {row.itemKey && <div className="flex justify-end px-3 pb-2">{control(row)}</div>}
    </li>)}</ul>
  </div>;
}

type CatalogRow = { id: string; name: string; spec: string; unit: string; price: number | null };
const catalogColumns: CommonTableColumn<CatalogRow>[] = [
  { key: "name", label: "품목", value: row => row.name },
  { key: "spec", label: "규격 · 단위", value: row => [row.spec, row.unit].filter(Boolean).join(" · ") },
  { key: "price", label: "단가", align: "right", value: row => row.price === null ? "단가 문의" : formatWon(row.price) },
];

export function PublicMemberCatalog({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ lines: CatalogRow[]; hasMore: boolean } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/pricing-documents/shopping-catalog", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, page, q: query }), signal: controller.signal });
        if (!response.ok) throw new Error("Catalog unavailable");
        const data = await response.json() as { lines: CatalogRow[]; hasMore: boolean };
        if (!controller.signal.aborted) setResult(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [token, query, page]);
  const move = (value: number) => { setResult(null); setError(false); setPage(value); };
  return <div className="space-y-3">
    <SearchInput aria-label="전체 상품 검색" placeholder="품목명·규격 검색" value={query}
      onChange={value => { setQuery(value); move(1); }} />
    {error ? <p role="status">전체 상품을 불러오지 못했습니다. 연결된 매장 또는 발행 회사에 문의해 주세요.</p>
      : !result ? <p role="status">전체 상품을 불러오는 중입니다.</p>
      : <>
        <div className="hidden md:block"><CommonDataTable rows={result.lines} columns={catalogColumns} rowKey={row => row.id} settingsKey="cx70-member-catalog" /></div>
        <ul className="md:hidden">{result.lines.map(row => <li key={row.id}>
          <MobileListRow title={row.name} subtitle={[row.spec, row.unit].filter(Boolean).join(" · ")}
            trailing={row.price === null ? "단가 문의" : <MoneyText value={row.price} />} />
        </li>)}</ul>
        {!result.lines.length && <p>검색에 맞는 품목이 없습니다.</p>}
        {(page > 1 || result.hasMore) && <div className="flex justify-between">
          <Button type="button" variant="outline" disabled={page === 1} onClick={() => move(page - 1)}>이전</Button>
          <Button type="button" variant="outline" disabled={!result.hasMore} onClick={() => move(page + 1)}>다음</Button>
        </div>}
      </>}
  </div>;
}
