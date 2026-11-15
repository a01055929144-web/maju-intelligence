"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { SearchInput } from "@/components/ui/search-input";
import { ErrorState } from "@/components/ui/state";
import { formatNumber, formatWon } from "@/domains/shared/money";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { SalesTransactionItem } from "@/lib/store";

export function SalesTransactionTable({ companyId, dateFrom, dateTo, initialItems, initialTruncated, settingsKey }: {
  readonly companyId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly initialItems: SalesTransactionItem[];
  readonly initialTruncated: boolean;
  readonly settingsKey: string;
}) {
  const [items, setItems] = useState<SalesTransactionItem[]>(initialItems);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    if (!normalizedQuery) return items;
    return items.filter((item) => [item.customerName, item.productName, item.businessRegistrationNumber, item.salesDate]
      .filter(Boolean).some((value) => String(value).toLocaleLowerCase("ko").includes(normalizedQuery)));
  }, [items, query]);
  const columns = useMemo<CommonTableColumn<SalesTransactionItem>[]>(() => [
    { key: "number", label: "No", sortable: false, align: "center", width: 72, value: () => "", render: (_row, index) => index + 1 },
    { key: "salesDate", label: "매출일", width: 120, value: (row) => row.salesDate || "-" },
    { key: "customerName", label: "거래처", width: 180, value: (row) => row.customerName },
    { key: "businessRegistrationNumber", label: "사업자번호", width: 150, value: (row) => row.businessRegistrationNumber || "-" },
    { key: "productName", label: "품목", width: 180, value: (row) => row.productName || "-" },
    { key: "quantity", label: "수량", align: "right", total: true, width: 100, value: (row) => row.quantity, render: (row) => formatNumber(row.quantity) },
    { key: "salesAmount", label: "매출금액", align: "right", total: true, width: 140, value: (row) => row.salesAmount, render: (row) => formatWon(Math.round(row.salesAmount)) },
    { key: "createdAt", label: "적재시각", width: 180, value: (row) => row.createdAt }
  ], []);

  useEffect(() => {
    setItems(initialItems);
    setTruncated(initialTruncated);
    setLoadMoreError("");
  }, [initialItems, initialTruncated]);

  async function loadMore() {
    if (isLoadingMore || !truncated) return;
    setIsLoadingMore(true);
    setLoadMoreError("");
    try {
      const params = new URLSearchParams({ offset: String(items.length) });
      if (companyId) params.set("companyId", companyId);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const response = await fetchWithTimeout(`/api/revenue/transactions?${params.toString()}`, { cache: "no-store" }, 10000);
      if (!response.ok) throw new Error("추가 거래내역을 불러오지 못했습니다.");
      const payload = await response.json();
      const nextItems: SalesTransactionItem[] = Array.isArray(payload?.sales?.items) ? payload.sales.items : [];
      setItems((previous) => [...previous, ...nextItems]);
      setTruncated(Boolean(payload?.sales?.truncated));
    } catch (error) {
      setLoadMoreError(error instanceof Error ? error.message : "추가 거래내역을 불러오지 못했습니다.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <section className="maju-section-card scroll-mt-28" id="ledger-table">
      <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-slate-950">원장 테이블</h2><p className="mt-1 text-sm text-slate-500">최근 업로드 행</p></div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{query ? `${formatNumber(filteredItems.length)} / ${formatNumber(items.length)}행` : `${formatNumber(items.length)}행 표시`}</Badge>
      </div>
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-3 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <SearchInput className="min-w-[220px] flex-1 sm:max-w-md" onChange={setQuery} placeholder="거래처·사업자번호·품목·매출일 검색" value={query} />
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500">검색 결과 {formatNumber(filteredItems.length)}행</span>
        </div>
      </div>
      <CommonDataTable columns={columns} emptyMessage={items.length ? "검색 조건과 일치하는 거래내역이 없습니다." : "아직 업로드된 매출 원장이 없습니다."} filename="매출_원장.csv" rowKey={(row) => row.id} rows={filteredItems} settingsKey={settingsKey} />
      {truncated ? (
        <div aria-live="polite" className="space-y-1.5 border-t border-slate-100 p-3">
          <button className="maju-button-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoadingMore} onClick={loadMore} type="button">
            {isLoadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> 거래내역을 불러오는 중입니다.</> : "더 불러오기"}
          </button>
          {loadMoreError ? <ErrorState bare message={loadMoreError} onRetry={() => void loadMore()} /> : null}
        </div>
      ) : null}
    </section>
  );
}
