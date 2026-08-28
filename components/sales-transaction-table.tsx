"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { SalesTransactionItem } from "@/lib/store";

const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export function SalesTransactionTable({
  companyId,
  dateFrom,
  dateTo,
  initialItems,
  initialTruncated
}: {
  readonly companyId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly initialItems: SalesTransactionItem[];
  readonly initialTruncated: boolean;
}) {
  const [items, setItems] = useState<SalesTransactionItem[]>(initialItems);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(30);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [currentPage, items, pageSize]);
  const pageStart = items.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(items.length, currentPage * pageSize);

  async function loadMore() {
    if (isLoadingMore || !truncated) return;
    setIsLoadingMore(true);
    setLoadMoreError("");

    try {
      const params = new URLSearchParams({ offset: String(items.length) });
      if (companyId) params.set("companyId", companyId);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const response = await fetch(`/api/revenue/transactions?${params.toString()}`, { cache: "no-store" });
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
        <div>
          <h2 className="text-lg font-black text-slate-950">원장 테이블</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">최근 업로드 행</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{items.length.toLocaleString()}행 표시</Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-500">
            보기
            <select
              className="h-7 border-0 bg-transparent p-0 text-xs font-black text-slate-900 outline-none focus:ring-0"
              onChange={(event) => {
                setPageSize(Number(event.target.value) as ListPageSize);
                setPage(1);
              }}
              value={pageSize}
            >
              {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}개
                </option>
              ))}
            </select>
          </label>
          <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-black text-slate-500">
            {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {items.length.toLocaleString()}행
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            이전
          </button>
          <span className="text-xs font-black text-slate-400">
            {currentPage.toLocaleString()} / {totalPages.toLocaleString()}
          </span>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            type="button"
          >
            다음
          </button>
        </div>
      </div>
      <div className="max-h-[calc(100dvh-360px)] min-h-[360px] overflow-auto overscroll-contain">
        <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 shadow-[0_1px_0_#e2e8f0]">
            <tr className="text-left text-xs font-black text-slate-500">
              <th className="border-b border-slate-200 px-3 py-3 text-center">No</th>
              <th className="border-b border-slate-200 px-3 py-3">매출일</th>
              <th className="border-b border-slate-200 px-3 py-3">거래처</th>
              <th className="border-b border-slate-200 px-3 py-3">사업자번호</th>
              <th className="border-b border-slate-200 px-3 py-3">품목</th>
              <th className="border-b border-slate-200 px-3 py-3 text-right">수량</th>
              <th className="border-b border-slate-200 px-3 py-3 text-right">매출금액</th>
              <th className="border-b border-slate-200 px-3 py-3">적재시각</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((item, index) => (
              <tr key={item.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/70">
                <td className="border-b border-slate-100 px-3 py-3 text-center text-xs text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.salesDate || "-"}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.customerName}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.businessRegistrationNumber || "-"}</td>
                <td className="border-b border-slate-100 px-3 py-3">{item.productName || "-"}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right">{item.quantity.toLocaleString()}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right text-primary">{Math.round(item.salesAmount).toLocaleString()}원</td>
                <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-500">{item.createdAt}</td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td className="px-3 py-12 text-center text-sm font-bold text-slate-500" colSpan={8}>
                  아직 업로드된 매출 원장이 없습니다. 매출 원장을 업로드하면 이곳에 누적됩니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <div className="space-y-1.5 border-t border-slate-100 p-3">
          <button
            className="maju-button-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {isLoadingMore ? "불러오는 중..." : "더 불러오기"}
          </button>
          {loadMoreError ? <p className="text-center text-xs font-bold text-rose-600">{loadMoreError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
