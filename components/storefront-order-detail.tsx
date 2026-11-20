"use client";

import { useEffect, useRef, useState } from "react";
import type { StorePortalOrder } from "@/lib/store/07-store-portal";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { StoreOrderReadDetail, type StoreOrderDetailLine } from "./store-order-read-detail";
import { Button } from "./ui/button";
import { Notice } from "./ui/notice";

type Order = { id: string; status: string; knownTotal: number; marketPricePending: boolean;
  deliveryDate: string | null; revision: number; requestMemo: string;
  lines: StoreOrderDetailLine[] };

export function StorefrontOrderDetail({ token, order, documentReadEnabled }: { token: string; order: Order; documentReadEnabled: boolean }) {
  const [detail, setDetail] = useState<StorePortalOrder | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (busy) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setDetail(null);
    try {
      const response = await fetchWithTimeout("/api/storefront", { method: "POST", cache: "no-store", signal: abort.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, orderDetailId: order.id }) }, 15000);
      if (!response.ok) throw new Error("detail_unavailable");
      const result = await response.json() as { orderDetail?: StorePortalOrder };
      if (!result.orderDetail || result.orderDetail.id !== order.id) throw new Error("detail_unavailable");
      if (!abort.signal.aborted) setDetail(result.orderDetail);
    } catch { if (!abort.signal.aborted) setError("주문·전표를 확인하지 못했습니다."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <details className="min-w-0 rounded border p-3" aria-label={`주문 상세 ${order.id}`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-[52px] cursor-pointer break-words py-3 font-medium">주문 상세 · 배송 {(detail ? detail.delivery_date : order.deliveryDate) || "미정"}</summary>
    {open && <div className="min-w-0 space-y-3">
      {order.requestMemo && <p className="break-words text-sm">요청 사항: {order.requestMemo}</p>}
      {documentReadEnabled && <Button className="min-h-[52px]" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "확인 중" : error ? "전표 다시 확인" : "최신 주문·전표 확인"}</Button>}
      {error && <Notice kind="error">주문·전표를 확인하지 못했습니다. 다시 시도하거나 매장 전용 주문 내역을 확인해 주세요.</Notice>}
      {detail && <p className="text-sm">최근 주문 내역에서 다시 확인했습니다.</p>}
      <StoreOrderReadDetail orderId={order.id} status={detail?.status ?? order.status} knownTotal={detail?.known_total ?? order.knownTotal}
        marketPricePending={detail?.has_market_price ?? order.marketPricePending} lines={detail?.lines ?? order.lines}
        document={detail?.document} linkAccess={!documentReadEnabled} />
    </div>}
  </details>;
}
