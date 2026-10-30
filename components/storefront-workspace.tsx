"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canOrderForDelivery, summarizeOrder, type DeliveryPolicy } from "@/domains/order/order-rules";

type Product = { key: string; productId: string; promotionId: string | null;
  name: string; brand: string; spec: string; unit: string;
  badge: string; taxType: "taxable" | "exempt"; unitPrice: number | null;
  priceIncludesTax: boolean; isMarketPrice: boolean; remaining: number | null;
  maximumQuantity: number | null;
  recentDispatchPrice: number | null; recentDispatchDate: string | null };
type Store = { title: string; companyName: string; customerName: string;
  deliveryAddress: string | null; version: number; validUntil: string;
  priceAvailable: boolean; canOrder: boolean; nextDeliveryDate: string | null;
  selectedDeliveryDate: string;
  notice: string; marketPriceNotice: string; policy: DeliveryPolicy; lines: Product[] };
type Order = { id: string; deliveryDate: string; status: string; knownTotal: number;
  marketPricePending: boolean; submittedAt: string; revision: number;
  lines: { product_id: string; promotion_id: string | null; product_name: string; quantity: number;
    unit_price: number | null; total_amount: number | null }[] };
type Preference = { productId: string; isFavorite: boolean;
  isHidden: boolean; willNotOrder: boolean };
type Response = { store: Store; orders: Order[]; preferences: Preference[];
  historyPage: number; historyHasMore: boolean; message?: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function StorefrontWorkspace() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Response | null>(null);
  const [tab, setTab] = useState<"home" | "order" | "history" | "info">("home");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryDate, setDeliveryDate] = useState("");
  const [memo, setMemo] = useState("");
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [productView, setProductView] = useState<"all" | "favorites" | "hidden">("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const retryKey = useRef<string | null>(null);
  const loadSequence = useRef(0);
  const endpoint = "/api/storefront";
  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (value && value.length <= 200) setToken(value);
    else setMessage("매장 링크를 확인해 주세요.");
  }, []);
  const load = useCallback(async (day?: string, historyPage = 1) => {
    if (!token) return;
    const sequence = ++loadSequence.current;
    const response = await fetch(endpoint, { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, deliveryDate: day, historyPage }) });
    const result = await response.json() as Response;
    if (!response.ok) throw new Error(result.message || "매장 링크를 열 수 없습니다.");
    if (sequence !== loadSequence.current) return;
    setData(result);
    setDeliveryDate(result.store.selectedDeliveryDate);
  }, [endpoint, token]);
  useEffect(() => { if (token) void load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다.")); }, [load, token]);
  const store = data?.store;
  const preferences = new Map(data?.preferences.map((item) => [item.productId, item]) ?? []);
  const visibleProducts = store?.lines.filter((line) => {
    const preference = preferences.get(line.productId);
    return productView === "hidden" ? preference?.isHidden === true :
      productView === "favorites" ? preference?.isFavorite === true && !preference.isHidden :
        !preference?.isHidden || (cart[line.key] ?? 0) > 0;
  }) ?? [];
  const selected = store?.lines.filter((line) => (cart[line.key] ?? 0) > 0) ?? [];
  let summary: ReturnType<typeof summarizeOrder> | null = null;
  try {
    if (store && selected.length) summary = summarizeOrder(selected.map((line) => ({
      productId: line.productId, quantity: cart[line.key],
      unitPrice: line.unitPrice, taxType: line.taxType,
      priceIncludesTax: line.priceIncludesTax,
    })), store.policy);
  } catch { /* The server returns a field-level order error on submission. */ }
  function changeQuantity(line: Product, delta: number) {
    const max = Math.min(100000, line.maximumQuantity ?? 100000, line.remaining ?? 100000);
    setCart((old) => { const next = { ...old, [line.key]: Math.max(0, Math.min(max, (old[line.key] || 0) + delta)) };
      retryKey.current = null; return next; });
  }
  async function changePreference(productId: string, key: "isFavorite" | "isHidden") {
    const current = preferences.get(productId) ?? {
      productId, isFavorite: false, isHidden: false, willNotOrder: false,
    };
    const updated = { ...current, [key]: !current[key] };
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, { method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...updated }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "품목 설정을 저장하지 못했습니다.");
      setData((old) => old ? { ...old, preferences: [
        ...old.preferences.filter((item) => item.productId !== productId), updated,
      ] } : old);
      if (updated.isHidden) {
        setCart((old) => Object.fromEntries(Object.entries(old).filter(([key]) =>
          !key.startsWith(`${productId}:`))));
        retryKey.current = null;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "품목 설정을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  function fromOrder(order: Order, edit: boolean) {
    const available = new Set(store?.lines.map((line) => line.key) ?? []);
    const copied = order.lines.filter((line) => available.has(`${line.product_id}:${line.promotion_id ?? ""}`));
    const missing = order.lines.length - copied.length;
    if (edit && missing) {
      setMessage(`현재 문서에서 ${missing}개 품목을 찾을 수 없어 이 주문을 수정할 수 없습니다. 담당자에게 문의해 주세요.`);
      return;
    }
    setCart(Object.fromEntries(copied.map((line) => [
      `${line.product_id}:${line.promotion_id ?? ""}`, Number(line.quantity),
    ])));
    const day = edit ? order.deliveryDate : store?.nextDeliveryDate || "";
    setDeliveryDate(day);
    if (day) void load(day).catch(() => setMessage("선택한 배송일의 가격을 불러오지 못했습니다."));
    setEditing(edit ? { id: order.id, revision: order.revision } : null);
    retryKey.current = null;
    setTab("order");
    setMessage(`${edit ? "마감 전 주문을 수정합니다." : "지난 품목을 담았습니다."} 현재 가격을 다시 확인해 주세요.${
      missing ? ` 현재 문서에 없는 품목 ${missing}개는 담지 않았습니다.` : ""}`);
  }
  async function submit() {
    if (!store || !summary?.canSubmit || !deliveryDate || !store.canOrder) return;
    setBusy(true); setMessage("");
    if (!retryKey.current) retryKey.current = crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, deliveryDate, memo, idempotencyKey: retryKey.current,
          orderId: editing?.id ?? null, expectedRevision: editing?.revision ?? null,
          lines: selected.map((line) => ({ productId: line.productId,
            promotionId: line.promotionId, quantity: cart[line.key] })) }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "주문을 저장하지 못했습니다.");
      retryKey.current = null; setCart({}); setEditing(null); setMemo("");
      setTab("history");
      try {
        await load(undefined, 1);
        setMessage("주문을 받았습니다. 주문 내역에서 확인해 주세요.");
      } catch {
        setMessage("주문은 저장됐습니다. 내역을 불러오지 못했으니 화면을 새로고침해 확인해 주세요.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "주문을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  if (!store) return <main className="mx-auto max-w-xl p-5"><p role="status">{message || "매장 정보를 불러오는 중입니다."}</p></main>;
  return <main className="mx-auto min-h-dvh max-w-xl bg-white pb-24 text-slate-900">
    <header className="sticky top-0 z-10 border-b bg-white p-4">
      <p className="text-xs text-slate-600">{store.companyName} · {store.customerName}</p>
      <h1 className="text-lg font-semibold">{store.title}</h1>
      {store.notice && <p className="mt-2 rounded bg-blue-50 p-2 text-sm">{store.notice}</p>}
      {!store.priceAvailable && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">문서 유효기간이 지났습니다. 품목은 볼 수 있지만 가격과 주문은 잠시 숨겼습니다.</p>}
    </header>
    {message && <p role="status" className="mx-4 mt-3 rounded border p-3 text-sm">{message}</p>}
    {tab === "home" && <section className="space-y-4 p-4">
      <p>다음 배송일: <strong>{store.nextDeliveryDate || "권역 배송일 설정 필요"}</strong></p>
      <div className="grid grid-cols-2 gap-2">
        <button className="min-h-14 rounded bg-slate-900 px-4 text-white" onClick={() => setTab("order")}>주문하기</button>
        <button className="min-h-14 rounded border px-4" onClick={() => setTab("history")}>지난 주문 다시 담기</button>
      </div>
      <button className="min-h-11 rounded border px-4 text-sm" onClick={() => { setProductView("favorites"); setTab("order"); }}>
        즐겨찾기 품목 보기</button>
      <p className="text-sm text-slate-600">주문은 후결제로 접수됩니다. 시세 품목은 출고 전 단가가 확정됩니다.</p>
      <p className="text-sm">배송지: {store.deliveryAddress || "등록된 주소가 없습니다. 거래처 담당자에게 확인해 주세요."}</p>
    </section>}
    {tab === "order" && <section className="space-y-4 p-4">
      <h2 className="font-semibold">{editing ? "주문 수정" : "주문하기"}</h2>
      <label className="block text-sm">배송일
        <input className="mt-1 min-h-11 w-full rounded border p-2" type="date" value={deliveryDate}
          min={store.nextDeliveryDate || undefined}
          onChange={(event) => { const day = event.target.value; setDeliveryDate(day); retryKey.current = null;
            if (day) void load(day).catch(() => setMessage("선택한 배송일의 가격을 불러오지 못했습니다.")); }} /></label>
      <p className="text-sm text-slate-600">배송 요일·휴일·마감은 저장할 때 다시 확인합니다.</p>
      <div role="group" aria-label="품목 보기" className="flex gap-2 text-sm">
        {(["all", "favorites", "hidden"] as const).map((view) =>
          <button key={view} aria-pressed={productView === view} className="min-h-11 rounded border px-3"
            onClick={() => setProductView(view)}>{view === "all" ? "전체" : view === "favorites" ? "즐겨찾기" : "숨긴 품목"}</button>)}
      </div>
      <ul className="space-y-2">{visibleProducts.map((line) => <li key={line.key} className="rounded border p-3">
        <div className="flex justify-between gap-2"><div><strong>{line.name}</strong>
          {line.badge && <span className="ml-2 rounded bg-amber-50 px-2 text-xs">{line.badge}</span>}
          <p className="text-sm text-slate-600">{[line.brand, line.spec, line.unit].filter(Boolean).join(" · ")}</p></div>
          <div className="text-right text-sm">{line.isMarketPrice ? "시세 · 가격 미정" :
            line.unitPrice === null ? "가격 문의" : won(line.unitPrice)}</div></div>
        {line.isMarketPrice && <p className="mt-1 text-xs text-amber-800">{store.marketPriceNotice}
          {line.recentDispatchPrice !== null && line.recentDispatchDate &&
            <> 최근 출고 {line.recentDispatchDate.slice(5)} {won(line.recentDispatchPrice)} (참고)</>}
        </p>}
        <div className="mt-2 flex gap-2 text-xs">
          <button disabled={busy} aria-pressed={preferences.get(line.productId)?.isFavorite === true}
            className="min-h-11 rounded border px-3" onClick={() => void changePreference(line.productId, "isFavorite")}>
            {preferences.get(line.productId)?.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
          <button disabled={busy} className="min-h-11 rounded border px-3"
            onClick={() => void changePreference(line.productId, "isHidden")}>
            {preferences.get(line.productId)?.isHidden ? "다시 표시" : "품목 숨기기"}</button>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button aria-label={`${line.name} 수량 줄이기`} className="min-h-11 min-w-11 rounded border" onClick={() => changeQuantity(line, -1)}>−</button>
          <span className="min-w-8 text-center">{cart[line.key] || 0}</span>
          <button aria-label={`${line.name} 수량 늘리기`} className="min-h-11 min-w-11 rounded border" onClick={() => changeQuantity(line, 1)}>＋</button>
        </div>
      </li>)}</ul>
      <label className="block text-sm">요청 사항<textarea className="mt-1 w-full rounded border p-2" maxLength={500}
        value={memo} onChange={(event) => { setMemo(event.target.value); retryKey.current = null; }} /></label>
      {summary && <div className="rounded bg-slate-50 p-3 text-sm">
        <p>과세 공급가액 {won(summary.taxableSupply)} · 면세 공급가액 {won(summary.exemptSupply)}</p>
        <p>부가세 {won(summary.tax)} · 배송비 {won(summary.deliveryFee)}</p>
        <p className="font-semibold">확정된 품목 합계 {won(summary.knownTotal)}</p>
        {summary.marketCount > 0 && <p className="text-amber-800">시세 품목 {summary.marketCount}개는 가격 확정 후 합계가 달라집니다.</p>}
        {summary.belowMinimum && <p className="text-amber-800">최소 주문금액 {won(store.policy.minimumAmount)} 미달</p>}
      </div>}
      <button disabled={!store.canOrder || busy || !summary?.canSubmit} className="min-h-12 w-full rounded bg-slate-900 text-white disabled:opacity-50"
        onClick={() => void submit()}>{busy ? "저장 중" : editing ? "수정 저장" : "후결제로 주문 신청"}</button>
    </section>}
    {tab === "history" && <section className="space-y-3 p-4"><h2 className="font-semibold">주문 내역</h2>
      {!store.priceAvailable ? <p className="text-sm text-slate-600">문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다. 담당자에게 새 링크를 요청해 주세요.</p> :
        !data?.orders.length && <p className="text-sm text-slate-600">아직 주문이 없습니다.</p>}
      {data?.orders.map((order) => <article key={order.id} className="rounded border p-3 text-sm">
        <div className="flex justify-between gap-2"><strong>{order.deliveryDate} 배송</strong><span>{order.status}</span></div>
        <p className="mt-1 text-slate-600">{order.lines.map((line) => `${line.product_name} ${line.quantity}`).join(" · ")}</p>
        <p>{won(order.knownTotal)}{order.marketPricePending ? " + 시세 품목 가격 미정" : ""}</p>
        <div className="mt-2 flex gap-2"><button className="min-h-11 rounded border px-3" onClick={() => fromOrder(order, false)}>다시 담기</button>
          {order.status === "submitted" && store.priceAvailable && store.policy.weekdays.length > 0 &&
            canOrderForDelivery(order.deliveryDate, store.policy) &&
            <button className="min-h-11 rounded border px-3" onClick={() => fromOrder(order, true)}>마감 전 수정</button>}</div>
      </article>)}
      {store.priceAvailable && <div className="flex items-center justify-between gap-2 text-sm">
        <button disabled={data?.historyPage === 1 || busy} className="min-h-11 rounded border px-3 disabled:opacity-50"
          onClick={() => void load(deliveryDate, (data?.historyPage ?? 1) - 1).catch(() => setMessage("이전 내역을 불러오지 못했습니다."))}>이전</button>
        <span>{data?.historyPage ?? 1}페이지</span>
        <button disabled={!data?.historyHasMore || busy} className="min-h-11 rounded border px-3 disabled:opacity-50"
          onClick={() => void load(deliveryDate, (data?.historyPage ?? 1) + 1).catch(() => setMessage("다음 내역을 불러오지 못했습니다."))}>다음</button>
      </div>}</section>}
    {tab === "info" && <section className="space-y-3 p-4"><h2 className="font-semibold">매장 정보</h2>
      <p>매장: {store.customerName}</p><p>배송지: {store.deliveryAddress || "등록되지 않음"}</p>
      <p className="text-sm text-slate-600">배송지와 출입 정보 변경은 담당자에게 요청해 주세요.</p>
    </section>}
    <nav aria-label="매장 메뉴" className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-xl -translate-x-1/2 grid-cols-4 border-t bg-white text-sm">
      {(["home", "order", "history", "info"] as const).map((item, index) =>
        <button key={item} className={`min-h-14 ${tab === item ? "font-semibold text-blue-700" : "text-slate-600"}`}
          onClick={() => setTab(item)}>{["홈", "주문", "내역", "내 정보"][index]}</button>)}</nav>
  </main>;
}
