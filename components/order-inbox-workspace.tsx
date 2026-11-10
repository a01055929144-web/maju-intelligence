"use client";

import { useCallback, useEffect, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { canConfirmStoreOrder, storeOrderStatusLabel } from "../domains/order/store-order-status";

type Line = { name: string; spec: string; unit: string; quantity: number; total: number | null; marketPrice: boolean };
type Order = {
  id: string; customerName: string; deliveryDate: string | null; status: string;
  knownTotal: number; hasMarketPrice: boolean; requestMemo: string;
  submittedAt: string; revision: number; lines: Line[];
};

const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function OrderInboxWorkspace({ canConfirm, companyId }: { canConfirm: boolean; companyId: string }) {
  const [view, setView] = useState<"new" | "all">("new");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/orders?companyId=${encodeURIComponent(companyId)}&view=${view}&page=${page}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({})) as { items?: Order[]; hasMore?: boolean; message?: string };
    if (!response.ok) { setOrders([]); setError(result.message || "주문을 불러오지 못했습니다."); return; }
    setOrders(result.items ?? []);
    setHasMore(result.hasMore === true);
  }, [companyId, page, view]);
  useEffect(() => { void load(); }, [load]);

  async function confirm(order: Order) {
    setBusyId(order.id); setNotice("");
    const response = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", companyId, orderId: order.id, revision: order.revision }),
    });
    const result = await response.json().catch(() => ({})) as { message?: string };
    setBusyId("");
    setNotice(response.ok ? `${order.customerName} 주문을 확인했습니다.` : result.message || "확인 처리하지 못했습니다.");
    await load();
  }

  const columns: CommonTableColumn<Order>[] = [
    { key: "submittedAt", label: "접수 시각", sortable: true, value: (row) => row.submittedAt, render: (row) => kst(row.submittedAt) },
    { key: "customer", label: "매장", sortable: true, value: (row) => row.customerName },
    { key: "deliveryDate", label: "배송일", sortable: true, value: (row) => row.deliveryDate ?? "", render: (row) => row.deliveryDate ?? "배송일 확인 대기" },
    { key: "total", label: "금액", align: "right", sortable: true, value: (row) => row.knownTotal,
      render: (row) => `${won(row.knownTotal)}${row.hasMarketPrice ? " + 시가" : ""}` },
    { key: "lines", label: "품목", value: (row) => row.lines.length, render: (row) => <details>
      <summary className="cursor-pointer">{row.lines.length}개 품목</summary>
      <ul className="mt-1 space-y-1 text-sm text-slate-600">{row.lines.map((line, index) => <li key={index}>
        {line.name}{line.spec ? ` ${line.spec}` : ""} · {line.quantity}{line.unit} · {line.marketPrice || line.total === null ? "시가" : won(line.total)}
      </li>)}</ul>
    </details> },
    { key: "memo", label: "요청사항", value: (row) => row.requestMemo, render: (row) => row.requestMemo || "-" },
    { key: "status", label: "상태", sortable: true, value: (row) => storeOrderStatusLabel(row.status) },
    { key: "action", label: "처리", value: () => "", render: (row) => canConfirm && canConfirmStoreOrder(row.status)
      ? <Button className="min-h-11" disabled={busyId !== ""} onClick={() => void confirm(row)} size="sm">{busyId === row.id ? "확인 중…" : "확인"}</Button>
      : null },
  ];

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold">주문 확인</h1>
      <div className="flex gap-2" role="tablist">
        {(["new", "all"] as const).map((key) => <Button aria-selected={view === key} key={key} onClick={() => { setView(key); setPage(1); }}
          role="tab" size="sm" variant={view === key ? "default" : "outline"}>{key === "new" ? "새 주문" : "전체"}</Button>)}
      </div>
    </div>
    {!canConfirm && <p className="text-sm text-slate-600">관리자 미리보기입니다. 확인 처리는 고객사 계정에서 합니다.</p>}
    {notice && <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800" role="status">{notice}</p>}
    {error ? <div className="rounded-xl border bg-white p-6 text-center">
      <p className="text-slate-700">{error}</p>
      <Button className="mt-3" onClick={() => void load()} variant="outline">다시 시도</Button>
    </div> : orders === null ? <p className="text-slate-500">주문을 불러오는 중…</p> :
      <CommonDataTable columns={columns} emptyMessage={view === "new" ? "확인할 새 주문이 없습니다. 매장 주문 링크는 링크 관리에서 보낼 수 있습니다." : "받은 주문이 없습니다."}
        filename="주문목록.csv" rowKey={(row) => row.id} rows={orders} settingsKey={`orders:${companyId}`} />}
    {(page > 1 || hasMore) && <div className="flex justify-center gap-2">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)} variant="outline">이전</Button>
      <Button disabled={!hasMore} onClick={() => setPage(page + 1)} variant="outline">다음</Button>
    </div>}
  </section>;
}
