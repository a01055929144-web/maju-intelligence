"use client";

import { formatWon } from "@/domains/shared/money";
import { useCallback, useEffect, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { Button } from "./ui/button";
import { useConfirm } from "./ui/confirm-dialog";
import { SearchInput } from "./ui/search-input";
import { ErrorState, LoadingState } from "./ui/state";
import { STORE_ORDER_STATUSES, canConfirmStoreOrder, storeOrderStatusLabel } from "../domains/order/store-order-status";
import { StoreNotificationSettings } from "./store-notification-settings";
import { OrderDeliveryPhotos } from "./order-delivery-photos";
import { Dialog } from "./ui/dialog";

type Line = { name: string; spec: string; unit: string; quantity: number; unitPrice: number | null; supply: number | null; tax: number | null; total: number | null; marketPrice: boolean; promotion: boolean };
type Order = {
  id: string; storeAccountId: string | null; customerName: string; deliveryAddress: string | null; orderedBy: string;
  deliveryDate: string | null; status: string; knownTotal: number; hasMarketPrice: boolean;
  requestMemo: string; submittedAt: string; updatedAt: string; revision: number; lines: Line[];
  loadingPosition: string | null; recipientPhoneLast4: string | null; deliveryPasswordSet: boolean;
  supplyAmount: number; taxAmount: number; justConfirmed?: boolean;
  draftReceipt?: boolean;
  orderDocument?: { status: "draft" | "confirmed"; number: string } | { status: "unlinked" };
};

type Candidate = { customerId: string; name: string; address: string | null; reason: "business_number" | "name_address" };
const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const won = formatWon;
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function rangeFor(period: string) {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  if (period === "tomorrow") { from.setDate(from.getDate() + 1); to.setDate(to.getDate() + 1); }
  else if (period === "week") to.setDate(to.getDate() + 6);
  else if (period === "30d") from.setDate(from.getDate() - 29);
  return { from: dateValue(from), to: dateValue(to) };
}

export async function confirmExistingCustomerLink({
  confirm,
  customerName,
  link,
}: {
  confirm: (options: { body: string; confirmLabel: string; title: string }) => Promise<boolean>;
  customerName: string;
  link: () => Promise<void>;
}) {
  if (!await confirm({
    body: `'${customerName}' 거래처에 연결합니다. 접수된 주문이 해당 거래처로 옮겨지며 되돌릴 수 없습니다.`,
    confirmLabel: "연결",
    title: "기존 거래처에 연결",
  })) return false;
  await link();
  return true;
}

export function OrderInboxWorkspace({ canConfirm, companyId, deliveryPhotosEnabled = false, fulfillmentEnabled = false, listExportEnabled = false, preview = false }: { canConfirm: boolean; companyId: string; deliveryPhotosEnabled?: boolean; fulfillmentEnabled?: boolean; listExportEnabled?: boolean; preview?: boolean }) {
  const { confirm: confirmAction, confirmDialog } = useConfirm();
  const [status, setStatus] = useState("all");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState("30d");
  const [dateField, setDateField] = useState("submitted");
  const initialRange = rangeFor("30d");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [query, setQuery] = useState("");
  const [storeName, setStoreName] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [failedDocumentOrder, setFailedDocumentOrder] = useState("");
  const [review, setReview] = useState<{ order: Order; candidates: Candidate[] | null } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams({ companyId, status, page: String(page), dateField, from, to });
    if (storeName) params.set("q", storeName);
    const response = await fetch(`/api/orders?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({})) as { items?: Order[]; hasMore?: boolean; statusCounts?: Record<string, number>; message?: string };
    if (!response.ok) { setOrders([]); setError(result.message || "주문을 불러오지 못했습니다."); return; }
    setOrders(result.items ?? []);
    setHasMore(result.hasMore === true);
    setStatusCounts(result.statusCounts ?? {});
  }, [companyId, dateField, from, page, status, storeName, to]);
  useEffect(() => { void load(); }, [load]);

  async function confirm(order: Order) {
    setBusyId(order.id); setNotice("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", companyId, orderId: order.id, revision: order.revision }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string; code?: string; order?: { status: string; revision: number } };
      setFailedDocumentOrder(result.code === "order_document_failed" ? order.id : "");
      setNotice(response.ok ? `${order.customerName} 주문을 확인했습니다.` : result.message || "확인 처리하지 못했습니다.");
      if (response.ok) {
        const saved = { ...order, status: result.order?.status || "received", revision: result.order?.revision || order.revision + 1, updatedAt: new Date().toISOString(), justConfirmed: true };
        setOrders((current) => current?.map((item) => item.id === order.id ? saved : item) ?? []);
        setSelectedOrder((current) => current?.id === order.id ? saved : current);
        setStatusCounts((current) => ({ ...current, submitted: Math.max(0, (current.submitted || 0) - 1), received: (current.received || 0) + 1 }));
        window.dispatchEvent(new Event("company-notifications:reload"));
      }
    } catch {
      setNotice("확인 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyId("");
    }
  }

  async function dispatch(order: Order) {
    setBusyId(order.id); setNotice("");
    try {
      const response = await fetch("/api/orders/fulfillment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, orderIds: [order.id], idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json().catch(() => ({})) as { items?: Array<{ status: string; revision: number }>; message?: string };
      const saved = result.items?.[0];
      if (!response.ok || !saved) { setNotice(result.message || "배송 출발 처리에 실패했습니다."); return; }
      const next = { ...order, status: saved.status, revision: saved.revision, updatedAt: new Date().toISOString(), justConfirmed: false };
      setOrders((current) => current?.map((item) => item.id === order.id ? next : item) ?? []);
      setSelectedOrder(next);
      setStatusCounts((current) => ({ ...current, received: Math.max(0, (current.received || 0) - 1), in_delivery: (current.in_delivery || 0) + 1 }));
      setNotice(`${order.customerName} 주문이 배송 중으로 바뀌었습니다.`);
    } catch {
      setNotice("배송 출발 결과를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyId("");
    }
  }

  // CC-08: 첫 거래 거래처 확인 — 후보 보기, 새 거래처로 확인, 기존 거래처에 연결. 규칙은 서버(DB 함수)가 정한다.
  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) });
    const result = await response.json().catch(() => ({})) as { message?: string; candidates?: Candidate[] };
    if (!response.ok) throw new Error(result.message || "처리하지 못했습니다.");
    return result;
  }
  async function retryOrderDocument(order: Order) {
    setBusyId(order.id);
    setNotice("");
    try {
      await post({ action: "retry_order_document", orderId: order.id, revision: order.revision });
      setNotice("전표를 연결했습니다. 주문을 확인할 수 있습니다.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "전표 연결에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }
  async function openReview(order: Order) {
    setNotice(""); setReview({ order, candidates: null });
    try { setReview({ order, candidates: (await post({ action: "candidates", storeAccountId: order.storeAccountId })).candidates ?? [] }); }
    catch (e) { setReview(null); setNotice(e instanceof Error ? e.message : "후보를 불러오지 못했습니다."); }
  }
  async function decide(order: Order, action: "confirm_customer" | "link_customer", customerId?: string) {
    setBusyId(order.id);
    try { await post({ action, storeAccountId: order.storeAccountId, customerId }); setNotice(action === "confirm_customer" ? `${order.customerName}을(를) 새 거래처로 확인했습니다.` : "기존 거래처에 연결했습니다."); setReview(null); }
    catch (e) { setNotice(e instanceof Error ? e.message : "처리하지 못했습니다."); }
    setBusyId(""); await load();
  }
  async function linkCustomer(order: Order, customer: Candidate) {
    await confirmExistingCustomerLink({
      confirm: confirmAction,
      customerName: customer.name,
      link: () => decide(order, "link_customer", customer.customerId),
    });
  }

  function choosePeriod(value: string) {
    setPeriod(value);
    if (value === "custom") return;
    if (value === "tomorrow") setDateField("delivery");
    const range = rangeFor(value);
    setFrom(range.from); setTo(range.to); setPage(1);
  }

  const columns: CommonTableColumn<Order>[] = [
    ...(listExportEnabled ? [{ key: "id", label: "주문 ID", defaultHidden: true, value: (row: Order) => row.id }] : []),
    { key: "submittedAt", label: "접수 시각", sortable: true, value: (row) => row.submittedAt, render: (row) => kst(row.submittedAt) },
    { key: "customer", label: "매장", sortable: true, value: (row) => row.customerName, render: (row) => <button className={`min-h-11 text-left font-semibold text-teal-800 underline-offset-2 hover:underline ${row.justConfirmed ? "opacity-60" : ""}`} onClick={() => setSelectedOrder(row)} type="button">{row.customerName}{row.storeAccountId ? <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">거래처 확인 필요</span> : null}</button> },
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
      {deliveryPhotosEnabled ? <OrderDeliveryPhotos audience="customer" companyId={companyId} orderId={row.id} /> : null}
    </details> },
    ...(listExportEnabled ? [
      { key: "deliveryAddress", label: "배송지", defaultHidden: true, value: (row: Order) => row.deliveryAddress ?? "" },
      { key: "orderedBy", label: "주문자", defaultHidden: true, value: (row: Order) => row.orderedBy },
      { key: "lineDetails", label: "품목 전체", defaultHidden: true, value: (row: Order) => row.lines.map((line) =>
        `${line.name}${line.spec ? ` ${line.spec}` : ""} · ${line.quantity}${line.unit} · ${line.marketPrice || line.total === null ? "시가" : won(line.total)}`
      ).join(" | ") },
      { key: "marketPrice", label: "시가 포함", defaultHidden: true, value: (row: Order) => row.hasMarketPrice ? "예" : "아니오" },
      { key: "revision", label: "수정 번호", defaultHidden: true, value: (row: Order) => row.revision },
    ] : []),
    { key: "memo", label: "요청사항", value: (row) => row.requestMemo, render: (row) => row.requestMemo || "-" },
    { key: "status", label: "상태", sortable: true, value: (row) => storeOrderStatusLabel(row.status), render: (row) => <span className={row.justConfirmed ? "font-bold text-slate-500" : ""}>{storeOrderStatusLabel(row.status)}</span> },
    ...(orders?.some(row => row.orderDocument) ? [{
      key: "orderDocument", label: "매출 전표", value: (row: Order) => row.orderDocument?.status === "draft"
        ? `작성중 · ${row.orderDocument.number}` : row.orderDocument?.status === "confirmed"
        ? row.orderDocument.number : row.status === "submitted" ? (row.draftReceipt ? "접수 시 전표 연결" : "전표 연결 실패 또는 대기") : "미연결",
      render: (row: Order) => failedDocumentOrder === row.id ? "전표 연결 실패" : row.orderDocument?.status === "draft"
        ? `작성중 · ${row.orderDocument.number}` : row.orderDocument?.status === "confirmed"
        ? row.orderDocument.number : row.status === "submitted" ? (row.draftReceipt ? "접수 시 전표 연결" : "전표 연결 실패 또는 대기") : "미연결",
    }] : []),
    { key: "action", label: "처리", exportable: false, value: () => "", render: (row) => canConfirm && row.storeAccountId && canConfirmStoreOrder(row.status)
      ? <Button className="min-h-11" disabled={busyId !== ""} onClick={() => void openReview(row)} size="sm" variant="outline">거래처 확인</Button>
      : canConfirm && canConfirmStoreOrder(row.status) && !row.draftReceipt && row.orderDocument?.status === "unlinked"
      ? <Button className="min-h-11" disabled={busyId !== ""} onClick={() => void retryOrderDocument(row)} size="sm" variant="outline">전표 연결 다시 시도</Button>
      : canConfirm && canConfirmStoreOrder(row.status) && failedDocumentOrder === row.id
      ? <Button className="min-h-11" disabled={busyId !== ""} onClick={() => void confirm(row)} size="sm" variant="outline">전표 연결 다시 시도</Button>
      : canConfirm && canConfirmStoreOrder(row.status)
      ? <Button className="min-h-11" disabled={busyId !== ""} onClick={() => void confirm(row)} size="sm">{busyId === row.id ? "확인 중…" : "확인"}</Button>
      : null },
  ];

  return <section className="space-y-4">
    {!preview ? <StoreNotificationSettings /> : null}
    {fulfillmentEnabled ? <div className="flex justify-end"><a className="maju-button-secondary min-h-11" href={`/orders/fulfillment?companyId=${encodeURIComponent(companyId)}`}>출고 준비·인쇄</a></div> : null}
    <div aria-label="주문 상태" className="flex gap-2 overflow-x-auto pb-1" role="tablist">
      {["all", ...STORE_ORDER_STATUSES].map((key) => <Button aria-selected={status === key} className="min-h-11 shrink-0" key={key} onClick={() => { setStatus(key); setPage(1); }} role="tab" size="sm" variant={status === key ? "default" : "outline"}>
        {key === "all" ? "전체" : key === "submitted" ? `새 주문 ${statusCounts.submitted || 0}` : storeOrderStatusLabel(key)}
      </Button>)}
    </div>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setStoreName(query.trim()); setPage(1); }} role="search">
      <label className="text-sm font-semibold text-slate-700">기간
        <select aria-label="조회 기간" className="maju-input mt-1 block h-11" onChange={(event) => choosePeriod(event.target.value)} value={period}>
          <option value="today">오늘</option><option value="tomorrow">내일 배송</option><option value="week">이번 주</option><option value="30d">최근 30일</option><option value="custom">직접 선택</option>
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">기준
        <select aria-label="날짜 기준" className="maju-input mt-1 block h-11" onChange={(event) => { setDateField(event.target.value); setPage(1); }} value={dateField}>
          <option value="submitted">접수일 기준</option><option value="delivery">배송일 기준</option>
        </select>
      </label>
      {period === "custom" ? <><label className="text-sm font-semibold text-slate-700">시작일<input aria-label="시작일" className="maju-input mt-1 block h-11" onChange={(event) => { setFrom(event.target.value); setPage(1); }} type="date" value={from} /></label>
        <label className="text-sm font-semibold text-slate-700">종료일<input aria-label="종료일" className="maju-input mt-1 block h-11" onChange={(event) => { setTo(event.target.value); setPage(1); }} type="date" value={to} /></label></> : null}
      <div className="w-full text-sm font-semibold text-slate-700 sm:min-w-0 sm:flex-1"><span>매장 이름</span>
        <SearchInput aria-label="매장 이름 검색" className="mt-1 max-sm:!h-11 max-sm:w-full" inputProps={{ maxLength: 50, role: "textbox" }} onChange={setQuery} placeholder="두 글자 이상" value={query} />
      </div>
      <Button className="min-h-11" type="submit" variant="outline">검색</Button>
    </form>
    {!canConfirm && <p className="text-sm text-slate-600">{preview ? "관리자 미리보기입니다. 확인 처리는 고객사 계정에서 합니다." : "주문 관리는 대표·관리자가 합니다. 이 계정은 보기만 할 수 있습니다."}</p>}
    {notice && !selectedOrder && <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800" role="status">{notice}</p>}
    {review ? <div aria-label="거래처 확인" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm" role="region">
      <p className="font-bold">{review.order.customerName} — 처음 거래하는 매장입니다. 같은 거래처가 이미 있는지 확인해 주세요.</p>
      <p className="text-slate-600">확인하기 전에는 이 매장 주문을 확인·배송 처리할 수 없습니다. 기존 거래처에 연결하면 접수된 주문도 그 거래처로 옮겨지고, 자동으로 만든 거래처는 중복으로 표시됩니다.</p>
      {review.candidates === null ? <LoadingState bare label="후보를 찾는 중입니다..." /> : review.candidates.length ? <ul className="divide-y rounded border bg-white">
        {review.candidates.map((c) => <li className="flex flex-wrap items-center justify-between gap-2 p-2" key={c.customerId}>
          <span><b>{c.name}</b> <span className="text-slate-500">{c.address || "주소 없음"} · {c.reason === "business_number" ? "사업자번호 일치" : "이름·주소 비슷함"}</span></span>
          <Button disabled={busyId !== ""} onClick={() => void linkCustomer(review.order, c)} size="sm" variant="outline">이 거래처에 연결</Button></li>)}
      </ul> : <p className="text-slate-600">같은 거래처로 보이는 후보가 없습니다.</p>}
      <div className="flex gap-2"><Button disabled={busyId !== ""} onClick={() => void decide(review.order, "confirm_customer")} size="sm">새 거래처로 확인</Button>
        <Button onClick={() => setReview(null)} size="sm" variant="outline">닫기</Button></div>
    </div> : null}
    {error ? <ErrorState message={error} onRetry={() => void load()} /> : orders === null ? <LoadingState label="주문을 불러오는 중입니다..." /> :
      <CommonDataTable columns={columns} emptyMessage={storeName ? "검색한 매장의 주문이 없습니다." : status === "all" ? "최근 30일 주문이 없습니다." : "이 상태의 주문이 없습니다."}
        exportAllColumns={listExportEnabled} filename="주문목록.csv" pageSizeMode={listExportEnabled ? "order" : "list"} phoneCards={listExportEnabled}
        rowKey={(row) => row.id} rows={orders} settingsKey={`orders:${companyId}`} />}
    {(page > 1 || hasMore) && <div className="flex justify-center gap-2">
      <Button disabled={page === 1} onClick={() => setPage(page - 1)} variant="outline">이전</Button>
      <Button disabled={!hasMore} onClick={() => setPage(page + 1)} variant="outline">다음</Button>
    </div>}
    {selectedOrder ? <Dialog fullScreenOnMobile onClose={() => setSelectedOrder(null)} size="lg" title={`${selectedOrder.customerName} 주문 상세`}>
      <div className="mt-4 space-y-4 text-sm">
        {notice ? <p className="rounded-lg bg-teal-50 p-3 text-teal-800" role="status">{notice}</p> : null}
        <dl className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
          <div><dt className="font-semibold">주문 번호</dt><dd className="break-all">{selectedOrder.id}</dd></div>
          <div><dt className="font-semibold">접수 시각</dt><dd>{kst(selectedOrder.submittedAt)}</dd></div>
          <div><dt className="font-semibold">배송일</dt><dd>{selectedOrder.deliveryDate || "확인 대기"}</dd></div>
          <div><dt className="font-semibold">상태</dt><dd>{storeOrderStatusLabel(selectedOrder.status)}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">배송지</dt><dd>{selectedOrder.deliveryAddress || "미등록"}</dd></div>
          <div><dt className="font-semibold">적재 위치</dt><dd>{selectedOrder.loadingPosition || "미등록"}</dd></div>
          <div><dt className="font-semibold">연락처</dt><dd>{selectedOrder.recipientPhoneLast4 ? `끝 4자리 ${selectedOrder.recipientPhoneLast4}` : "미등록"}</dd></div>
          <div><dt className="font-semibold">배송 비밀번호</dt><dd>{selectedOrder.deliveryPasswordSet ? "설정됨" : "미설정"}</dd></div>
          <div><dt className="font-semibold">주문자</dt><dd>{selectedOrder.orderedBy}</dd></div>
          <div className="sm:col-span-2"><dt className="font-semibold">요청사항</dt><dd className="whitespace-pre-wrap">{selectedOrder.requestMemo || "없음"}</dd></div>
        </dl>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b"><th className="p-2">품목</th><th className="p-2">수량</th><th className="p-2 text-right">단가</th><th className="p-2 text-right">공급가</th><th className="p-2 text-right">세액</th><th className="p-2 text-right">합계</th></tr></thead><tbody>
          {selectedOrder.lines.map((line, index) => <tr className="border-b" key={index}><td className="p-2">{line.name}{line.spec ? ` · ${line.spec}` : ""}{line.promotion ? <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">행사</span> : null}</td><td className="p-2">{line.quantity}{line.unit}</td><td className="p-2 text-right">{line.marketPrice || line.unitPrice === null ? "시가" : won(line.unitPrice)}</td><td className="p-2 text-right">{line.supply === null ? "-" : won(line.supply)}</td><td className="p-2 text-right">{line.tax === null ? "-" : won(line.tax)}</td><td className="p-2 text-right">{line.marketPrice || line.total === null ? "시가" : won(line.total)}</td></tr>)}
        </tbody></table></div>
        <dl className="ml-auto grid max-w-sm grid-cols-2 gap-2 rounded-lg border p-3"><dt>공급가</dt><dd className="text-right">{won(selectedOrder.supplyAmount)}</dd><dt>세액</dt><dd className="text-right">{won(selectedOrder.taxAmount)}</dd><dt className="font-bold">저장된 주문 합계</dt><dd className="text-right font-bold">{won(selectedOrder.knownTotal)}{selectedOrder.hasMarketPrice ? " + 시가" : ""}</dd></dl>
        <div><h3 className="font-bold">상태 이력</h3><ul className="mt-1 list-disc pl-5"><li>접수됨 · {kst(selectedOrder.submittedAt)}</li>{selectedOrder.status !== "submitted" ? <li>{storeOrderStatusLabel(selectedOrder.status)} · {kst(selectedOrder.updatedAt)}</li> : null}</ul></div>
        {selectedOrder.orderDocument ? <p><b>매출 전표</b> · {selectedOrder.orderDocument.status === "unlinked" ? "미연결" : `${selectedOrder.orderDocument.status === "draft" ? "작성중" : "확정"} · ${selectedOrder.orderDocument.number}`}</p> : null}
        {deliveryPhotosEnabled ? <OrderDeliveryPhotos audience="customer" companyId={companyId} orderId={selectedOrder.id} /> : null}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {canConfirm && selectedOrder.storeAccountId && canConfirmStoreOrder(selectedOrder.status)
            ? <Button disabled={busyId !== ""} onClick={() => { setSelectedOrder(null); void openReview(selectedOrder); }}>거래처 확인</Button>
            : canConfirm && canConfirmStoreOrder(selectedOrder.status)
              ? <Button disabled={busyId !== ""} onClick={() => void confirm(selectedOrder)}>{busyId === selectedOrder.id ? "확인 중…" : "확인"}</Button>
              : canConfirm && fulfillmentEnabled && selectedOrder.status === "received"
                ? <Button disabled={busyId !== ""} onClick={() => void dispatch(selectedOrder)}>{busyId === selectedOrder.id ? "처리 중…" : "배송 출발"}</Button>
                : null}
          {selectedOrder.status === "in_delivery" ? <p className="text-slate-600">배송 완료는 기사 화면에서 코스·증빙과 함께 처리합니다.</p> : null}
          {fulfillmentEnabled ? <a className="maju-button-secondary inline-flex min-h-11 items-center" href={`/orders/fulfillment?companyId=${encodeURIComponent(companyId)}`}>출고 준비로 이동</a> : null}
        </div>
      </div>
    </Dialog> : null}
    {confirmDialog}
  </section>;
}
