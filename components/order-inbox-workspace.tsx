"use client";

import { useCallback, useEffect, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { STORE_ORDER_STATUSES, canConfirmStoreOrder, storeOrderStatusLabel } from "../domains/order/store-order-status";

type Line = { name: string; spec: string; unit: string; quantity: number; total: number | null; marketPrice: boolean };
type Order = {
  id: string; customerName: string; deliveryAddress: string | null; orderedBy: string;
  deliveryDate: string | null; status: string; knownTotal: number; hasMarketPrice: boolean;
  requestMemo: string; submittedAt: string; revision: number; lines: Line[];
};

const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function OrderInboxWorkspace({ canConfirm, companyId, preview = false }: { canConfirm: boolean; companyId: string; preview?: boolean }) {
  const [status, setStatus] = useState("submitted");
  const [query, setQuery] = useState("");
  const [storeName, setStoreName] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams({ companyId, status, page: String(page) });
    if (storeName) params.set("q", storeName);
    const response = await fetch(`/api/orders?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({})) as { items?: Order[]; hasMore?: boolean; message?: string };
    if (!response.ok) { setOrders([]); setError(result.message || "주문을 불러오지 못했습니다."); return; }
    setOrders(result.items ?? []);
    setHasMore(result.hasMore === true);
  }, [companyId, page, status, storeName]);
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
    { key: "lines", label: "주문 내용", value: (row) => row.lines.length, render: (row) => <details>
      <summary className="min-h-11 cursor-pointer content-center">{row.lines.length}개 품목 · 배송지·주문자</summary>
      <dl className="mt-1 space-y-1 text-sm text-slate-600">
        <div><dt className="inline font-semibold">배송지 </dt><dd className="inline break-words">{row.deliveryAddress || "거래처 주소 미등록"}</dd></div>
        <div><dt className="inline font-semibold">주문자 </dt><dd className="inline">{row.orderedBy}</dd></div>
      </dl>
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
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setStoreName(query.trim()); setPage(1); }} role="search">
      <label className="text-sm font-semibold text-slate-700">상태
        <select aria-label="주문 상태" className="maju-input mt-1 block h-11 min-w-[140px]" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}>
          {STORE_ORDER_STATUSES.map((key) => <option key={key} value={key}>{key === "submitted" ? "새 주문(접수됨)" : storeOrderStatusLabel(key)}</option>)}
          <option value="all">전체</option>
        </select>
      </label>
      <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">매장 이름
        <input aria-label="매장 이름 검색" className="maju-input mt-1 block h-11 w-full" maxLength={50} onChange={(event) => setQuery(event.target.value)} placeholder="두 글자 이상" value={query} />
      </label>
      <Button className="min-h-11" type="submit" variant="outline">검색</Button>
    </form>
    {!canConfirm && <p className="text-sm text-slate-600">{preview ? "관리자 미리보기입니다. 확인 처리는 고객사 계정에서 합니다." : "주문 확인은 대표·관리자가 합니다. 이 계정은 보기만 할 수 있습니다."}</p>}
    {notice && <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800" role="status">{notice}</p>}
    {error ? <div className="rounded-xl border bg-white p-6 text-center">
      <p className="text-slate-700">{error}</p>
      <Button className="mt-3" onClick={() => void load()} variant="outline">다시 시도</Button>
    </div> : orders === null ? <p className="text-slate-500">주문을 불러오는 중…</p> :
      <CommonDataTable columns={columns} emptyMessage={storeName ? "검색한 매장의 주문이 없습니다." : status === "submitted" ? "아직 주문이 없습니다 — 링크 관리에서 주문 링크를 보내 보세요." : "이 상태의 주문이 없습니다."}
        filename="주문목록.csv" rowKey={(row) => row.id} rows={orders} settingsKey={`orders:${companyId}`} />}
    {(page > 1 || hasMore) && <div className="flex justify-center gap-2">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)} variant="outline">이전</Button>
      <Button disabled={!hasMore} onClick={() => setPage(page + 1)} variant="outline">다음</Button>
    </div>}
  </section>;
}
