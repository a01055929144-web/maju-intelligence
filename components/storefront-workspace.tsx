"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { canOrderForDelivery, summarizeOrder, type DeliveryPolicy } from "@/domains/order/order-rules";
import { StoreCostPanel, type StoreCostAccess } from "./store-cost-panel";
import { StoreKakaoLoginPanel, type StoreKakaoLogin } from "./store-kakao-entry";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { publicSalesPriceDirection, type SalesPriceDirection } from "@/domains/pricing/storefront-price-direction";
import { DELIVERY_CONFIRMATION_NOTICE } from "../domains/order/delivery-confirmation";
import { deliveryEligibilityMessage } from "../domains/order/delivery-eligibility";

type Product = { key: string; productId: string; promotionId: string | null;
  name: string; category: string; brand: string; spec: string; unit: string;
  salesPriceDirection?: SalesPriceDirection;
  badge: string; taxType: "taxable" | "exempt"; unitPrice: number | null;
  priceIncludesTax: boolean; isMarketPrice: boolean; remaining: number | null;
  maximumQuantity: number | null;
  recentDispatchPrice: number | null; recentDispatchDate: string | null };
type Store = { title: string; companyName: string; customerName: string;
  deliveryAddress: string | null; version: number; validUntil: string;
  priceAvailable: boolean; canOrder: boolean; nextDeliveryDate: string | null;
  selectedDeliveryDate: string;
  deliveryEligibility?:{eligible:boolean;reason:string;territoryName?:string;weekdays:number[]};
  notice: string; marketPriceNotice: string; policy: DeliveryPolicy; lines: Product[] };
type Order = { id: string; deliveryDate: string | null; status: string; knownTotal: number;
  authorLabel?: string;
  requestMemo: string; marketPricePending: boolean; submittedAt: string; revision: number;
  lines: { product_id: string; promotion_id: string | null; product_name: string; quantity: number;
    specification?: string; sales_unit?: string; tax_type?: string;
    unit_price: number | null; total_amount: number | null }[] };
type Preference = { productId: string; isFavorite: boolean;
  isHidden: boolean; willNotOrder: boolean };
type Response = { store: Store; orders: Order[]; preferences: Preference[];
  memberLogin?: StoreKakaoLogin;
  memberManagement?: { href: string } | { message: string };
  historyPage: number; historyHasMore: boolean; message?: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const kstDay = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

export function StorefrontWorkspace({ costAccess = null, storeLogin = null }: { costAccess?: StoreCostAccess; storeLogin?: StoreKakaoLogin | null }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { const value = window.location.hash.slice(1); setToken(value.length <= 200 ? value : "invalid-link"); };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (token === null) return <p role="status">매장 주소를 확인 중입니다.</p>;
  // A bearer link does not prove that its customer matches the signed-in store account.
  return <StorefrontSession key={token} token={token} costAccess={token ? null : costAccess} storeLogin={token ? null : storeLogin} />;
}

function StorefrontSession({ token, costAccess, storeLogin }: { token: string; costAccess: StoreCostAccess; storeLogin: StoreKakaoLogin | null }) {
  const [data, setData] = useState<Response | null>(null);
  const [tab, setTab] = useState<"home" | "order" | "history" | "data" | "info">("home");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryDate, setDeliveryDate] = useState("");
  const [memo, setMemo] = useState("");
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [productView, setProductView] = useState<"all" | "favorites" | "hidden" | "complete">("all");
  const [category, setCategory] = useState("전체");
  const [orderView, setOrderView] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<"name" | "price">("name");
  const [ascending, setAscending] = useState(true);
  const [priceChangesOnly, setPriceChangesOnly] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [memberAccessChanged, setMemberAccessChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const retryKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const loadSequence = useRef(0);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("products") === "all") {
      setTab("order"); setProductView("complete"); setCategory("전체"); setPriceChangesOnly(false);
      setMessage("이 발행 문서의 주문 가능 품목 전체입니다. 다른 문서의 품목은 포함하지 않습니다.");
    }
  }, []);
  const endpoint = "/api/storefront";
  const load = useCallback(async (day?: string, historyPage = 1) => {
    if (!token) return;
    const sequence = ++loadSequence.current;
    setLoading(true); setLoadError("");
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, deliveryDate: day, historyPage }) });
      const result = await response.json() as Response;
      if (sequence !== loadSequence.current) return;
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) { setData(null); setCart({}); setEditing(null); setMemo(""); retryKey.current = null; }
        throw new Error(result.message || "매장 링크를 열 수 없습니다.");
      }
      setData(result);
      setMemberAccessChanged(false);
      setDeliveryDate(result.store.selectedDeliveryDate);
    } catch (error) {
      if (sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : "매장 정보를 불러오지 못했습니다.");
      throw error;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [endpoint, token]);
  useEffect(() => { if (token) void load().catch(() => undefined); }, [load, token]);
  const store = data?.store;
  const deliveryReady=Boolean(store&&(store.deliveryEligibility?.eligible??true)&&store.policy.weekdays.length>0);
  const pricesReady = !loading && !loadError && Boolean(deliveryDate) && deliveryDate === store?.selectedDeliveryDate;
  const pricesVisible = pricesReady && Boolean(store?.priceAvailable);
  const preferences = new Map(data?.preferences.map((item) => [item.productId, item]) ?? []);
  const categories = Array.from(new Set(store?.lines.map((line) => line.category || "미분류") ?? [])).sort((a, b) => a.localeCompare(b, "ko"));
  const hasPriceDirections = pricesReady && Boolean(store?.priceAvailable && store.lines.some(line => publicSalesPriceDirection(line.salesPriceDirection)));
  const changedPrices = hasPriceDirections ? store?.lines.filter((line) => !preferences.get(line.productId)?.isHidden &&
    (line.salesPriceDirection === "up" || line.salesPriceDirection === "down")) ?? [] : [];
  const visibleProducts = (store?.lines.filter((line) => {
    const preference = preferences.get(line.productId);
    const matchesView = productView === "complete" ? true : productView === "hidden" ? preference?.isHidden === true :
      productView === "favorites" ? preference?.isFavorite === true && !preference.isHidden :
        !preference?.isHidden || (cart[line.key] ?? 0) > 0;
    return matchesView && (category === "전체" || (line.category || "미분류") === category) &&
      (!priceChangesOnly || line.salesPriceDirection === "up" || line.salesPriceDirection === "down");
  }) ?? []).sort((a, b) => {
    if (sortBy === "price" && (a.unitPrice === null || b.unitPrice === null)) {
      return Number(a.unitPrice === null) - Number(b.unitPrice === null);
    }
    const order = sortBy === "price" ? a.unitPrice! - b.unitPrice! : a.name.localeCompare(b.name, "ko");
    return ascending ? order : -order;
  });
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
    if (!pricesReady || !store?.priceAvailable || !store.canOrder || busy) return;
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
    const day = edit ? order.deliveryDate || undefined : store?.nextDeliveryDate || undefined;
    setDeliveryDate(day || store?.selectedDeliveryDate || "");
    void load(day).catch(() => setMessage("현재 주문 가격을 불러오지 못했습니다."));
    setMemo(edit ? order.requestMemo : "");
    setEditing(edit ? { id: order.id, revision: order.revision } : null);
    retryKey.current = null;
    setTab("order");
    setCategory("전체"); setProductView("all"); setPriceChangesOnly(false);
    setMessage(`${edit ? "마감 전 주문을 수정합니다." : "지난 품목을 담았습니다."} 현재 가격을 다시 확인해 주세요.${
      missing ? ` 현재 문서에 없는 품목 ${missing}개는 담지 않았습니다.` : ""}`);
  }
  async function submit() {
    if (submitting.current || !store || !deliveryReady || !pricesReady || !summary?.canSubmit || !deliveryDate || !store.canOrder) return;
    submitting.current = true;
    setBusy(true); setMessage("");
    if (!retryKey.current) retryKey.current = crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, deliveryDate, memo, idempotencyKey: retryKey.current,
          orderId: editing?.id ?? null, expectedRevision: editing?.revision ?? null,
          lines: selected.map((line) => ({ productId: line.productId,
            promotionId: line.promotionId, quantity: cart[line.key] })) }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        if (response.status === 403 && /권한.*변경/.test(result.message || "")) setMemberAccessChanged(true);
        throw new Error(result.message || "주문을 저장하지 못했습니다.");
      }
      retryKey.current = null; setCart({}); setEditing(null); setMemo("");
      setTab("history");
      try {
        await load(undefined, 1);
        setMessage("주문을 받았습니다. 주문 내역에서 확인해 주세요.");
      } catch {
        setMessage("주문은 저장됐습니다. 내역을 불러오지 못했으니 화면을 새로고침해 확인해 주세요.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "주문을 저장하지 못했습니다."); }
    finally { submitting.current = false; setBusy(false); }
  }
  const retryLoad = <div className="space-y-2 rounded border p-3 text-sm" aria-live="polite">
    <p>{loading ? "선택한 배송일의 가격을 확인 중입니다." : loadError || "배송일을 선택해 주세요."}</p>
    {loadError && token ? <button disabled={loading || busy} className="min-h-[44px] rounded border px-3" onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>다시 불러오기</button> : null}
  </div>;
  if (!store) return <main className="mx-auto max-w-6xl space-y-4 p-5">{storeLogin && <StoreKakaoLoginPanel access={storeLogin} />}{costAccess && <><h1 className="text-lg font-semibold">매장 데이터</h1><StoreCostPanel access={costAccess} /></>}{token ? retryLoad : <p role="status">{costAccess || storeLogin ? "주문은 기존 매장 주문 링크에서 이용해 주세요." : "주문 링크 또는 담당자에게 받은 매장 전용 주소를 열어 주세요."}</p>}</main>;
  return <main className="mx-auto min-h-dvh max-w-6xl bg-white pb-24 text-slate-900 md:pb-8">
    <header className="sticky top-0 z-10 border-b bg-white p-4 md:px-6">
      <p className="text-xs text-slate-600">{store.companyName} · {store.customerName}</p>
      <h1 className="text-lg font-semibold">{store.title}</h1>
      {store.notice && <p className="mt-2 rounded bg-blue-50 p-2 text-sm">{store.notice}</p>}
      {!store.priceAvailable && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">문서 유효기간이 지났습니다. 품목은 볼 수 있지만 가격과 주문은 잠시 숨겼습니다.</p>}
    </header>
    <nav aria-label="매장 메뉴" className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-xl -translate-x-1/2 grid-cols-5 border-t bg-white text-sm md:static md:max-w-none md:translate-x-0 md:border-b md:border-t-0">
      {(["home", "order", "history", "data", "info"] as const).map((item, index) =>
        <button key={item} className={`min-h-14 ${tab === item ? "font-semibold text-blue-700" : "text-slate-600"}`}
          onClick={() => setTab(item)}>{["홈", "주문", "내역", "데이터", "내 정보"][index]}</button>)}</nav>
      {message && <div role="status" className="mx-4 mt-3 space-y-2 rounded border p-3 text-sm"><p>{message}</p>
        {memberAccessChanged && <Button variant="outline" className="min-h-[44px]" disabled={busy || loading}
          onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>로그인 상태 다시 확인</Button>}
      </div>}
      {!loading && !loadError && data?.memberLogin && <section className="space-y-2 p-4" aria-label="주문 구성원 로그인">
        <StoreKakaoLoginPanel access={data.memberLogin} newWindow />
        <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>로그인 상태 다시 확인</Button>
      </section>}
    {tab === "home" && <section className="space-y-4 p-4 md:max-w-3xl md:p-6">
      <p>다음 배송일: <strong>{deliveryReady ? store.nextDeliveryDate || "배송 가능일 확인 필요" : "매장 주소·배송 권역 확인 필요"}</strong></p>
      {changedPrices.length > 0 && <div className="rounded border p-3">
        <h2 className="font-semibold">판매가 변동</h2>
        <p className="text-sm">인상 {changedPrices.filter((line) => line.salesPriceDirection === "up").length}품목 · 인하 {changedPrices.filter((line) => line.salesPriceDirection === "down").length}품목</p>
        <p className="text-xs text-slate-600">같은 유통사의 직전 게시 판매가와 비교합니다.</p>
        <button className="mt-2 min-h-[44px] rounded border px-4 text-sm" onClick={() => { setCategory("전체"); setProductView("all"); setPriceChangesOnly(true); setTab("order"); }}>변동 품목 주문하기</button>
      </div>}
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-[44px]" onClick={() => { setCategory("전체"); setProductView("complete"); setPriceChangesOnly(false); setTab("order"); setMessage("이 발행 문서의 주문 가능 품목 전체입니다. 숨김·즐겨찾기·분류·가격 변동 필터를 해제했습니다."); }} type="button">주문 품목 전체 보기</Button>
        <button className="min-h-14 rounded bg-slate-900 px-4 text-white" onClick={() => { setCategory("전체"); setProductView("all"); setPriceChangesOnly(false); setTab("order"); }}>주문하기</button>
        <button className="min-h-14 rounded border px-4" onClick={() => setTab("history")}>지난 주문 다시 담기</button>
      </div>
      <button className="min-h-[44px] rounded border px-4 text-sm" onClick={() => { setCategory("전체"); setPriceChangesOnly(false); setProductView("favorites"); setTab("order"); }}>
        즐겨찾기 품목 보기</button>
      <p className="text-sm text-slate-600">주문은 후결제로 접수됩니다. 시세 품목은 출고 전 단가가 확정됩니다.</p>
      <p className="text-sm">배송지: {store.deliveryAddress || "등록된 주소가 없습니다. 거래처 담당자에게 확인해 주세요."}</p>
    </section>}
    {tab === "order" && <section className="space-y-4 p-4 md:p-6">
      {pricesVisible && visibleProducts.some(line => publicSalesPriceDirection(line.salesPriceDirection)) && <p className="text-xs text-slate-600">판매가 등락은 이전에 게시된 단가와 비교합니다.</p>}
      <h2 className="font-semibold">{editing ? "주문 수정" : "주문하기"}</h2>
      {!deliveryReady && <section className="space-y-2 rounded border p-3 text-sm" aria-label="배송 요일 설정 안내">
        <p role="status">{deliveryEligibilityMessage(store.deliveryEligibility&&!store.deliveryEligibility.eligible?store.deliveryEligibility.reason:"weekdays_unconfigured")}</p>
        <Button variant="outline" className="min-h-[44px]" disabled={busy || loading} onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>배송 설정 다시 확인</Button>
      </section>}
      {!pricesReady ? retryLoad : null}
      {deliveryReady && <p role="status">배송 가능 요일: {store.policy.weekdays.map(day=>["일","월","화","수","목","금","토"][day]).join("·")}요일</p>}
      <label className="block text-sm">배송일
        <input disabled={busy||!deliveryReady} className="mt-1 min-h-[44px] w-full rounded border p-2" type="date" value={deliveryDate}
          min={store.nextDeliveryDate || undefined}
          onChange={(event) => { const day = event.target.value; setDeliveryDate(day); retryKey.current = null;
            if (day) void load(day).catch(() => undefined);
            else { ++loadSequence.current; setLoading(false); setLoadError("배송일을 선택해 주세요."); } }} /></label>
      <p className="text-sm text-slate-600">배송 권역·가능 요일·휴일·마감은 주문 제출 직전에 서버에서 다시 확인합니다.</p>
      <div role="group" aria-label="품목 보기" className="flex gap-2 text-sm">
        {(["all", "favorites", "hidden"] as const).map((view) =>
          <button key={view} aria-pressed={productView === view} className="min-h-[44px] rounded border px-3"
            onClick={() => setProductView(view)}>{view === "all" ? "전체" : view === "favorites" ? "즐겨찾기" : "숨긴 품목"}</button>)}
      </div>
      <div role="group" aria-label="품목 대분류" className="flex gap-2 overflow-x-auto pb-1 text-sm">
        {["전체", ...categories].map((item) => <button key={item} aria-pressed={category === item}
          className={`min-h-[44px] shrink-0 rounded border px-3 ${category === item ? "border-blue-700 text-blue-700" : ""}`}
          onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button aria-pressed={priceChangesOnly} className="min-h-[44px] rounded border px-3"
          onClick={() => setPriceChangesOnly((value) => !value)}>판매가 변동만</button>
        <label>정렬 <select aria-label="정렬" disabled={busy || !pricesVisible} className="min-h-[44px] rounded border px-2" value={sortBy}
          onChange={(event) => setSortBy(event.target.value as "name" | "price")}>
          <option value="name">상품명</option><option value="price">판매가</option>
        </select></label>
        <button disabled={busy || !pricesVisible} className="min-h-[44px] rounded border px-3" onClick={() => setAscending((value) => !value)}
          aria-label={ascending ? "내림차순으로 변경" : "오름차순으로 변경"}>{ascending ? "오름차순 ↑" : "내림차순 ↓"}</button>
        <div role="group" aria-label="품목 배열" className="ml-auto hidden gap-1 md:flex">
          <button aria-pressed={orderView === "grid"} className="min-h-[44px] rounded border px-3" onClick={() => setOrderView("grid")}>격자형</button>
          <button aria-pressed={orderView === "table"} className="min-h-[44px] rounded border px-3" onClick={() => setOrderView("table")}>표형</button>
        </div>
      </div>
      {visibleProducts.length === 0 && <p className="rounded border p-3 text-sm">해당 조건의 품목이 없습니다. 분류나 필터를 바꿔 주세요.</p>}
      {orderView === "table" && <div className="hidden grid-cols-[minmax(0,1fr)_200px_150px] gap-3 bg-slate-50 p-3 text-sm text-slate-600 md:grid"><span>품목 · 규격 · 판매가</span><span>품목 설정</span><span>수량</span></div>}
      <ul className={orderView === "table" ? "grid gap-2" : "grid gap-2 md:grid-cols-2 xl:grid-cols-3"}>{visibleProducts.map((line) => <li key={line.key} className={`rounded border p-3 ${orderView === "table" ? "md:grid md:grid-cols-[minmax(0,1fr)_200px_150px] md:items-center md:gap-3" : ""}`}>
        <div className="flex justify-between gap-2"><div><strong>{line.name}</strong>
          {line.badge && <span className="ml-2 rounded bg-amber-50 px-2 text-xs">{line.badge}</span>}
          <p className="text-sm text-slate-600">{[line.brand, line.spec, line.unit].filter(Boolean).join(" · ")}</p>
          {pricesVisible && (line.salesPriceDirection === "up" || line.salesPriceDirection === "down" || line.salesPriceDirection === "flat") ? <Badge>판매가 {line.salesPriceDirection === "up" ? "상승" : line.salesPriceDirection === "down" ? "하락" : "보합"}</Badge> : null}</div>
          <div className="text-right text-sm">{!pricesVisible ? "배송일 가격 확인 필요" : line.isMarketPrice ? "시세 · 가격 미정" :
            line.unitPrice === null ? "가격 문의" : won(line.unitPrice)}
            {pricesVisible && <p className="text-xs text-slate-600">{line.taxType === "exempt" ? "면세" : `과세 · 부가세 ${line.priceIncludesTax ? "포함" : "별도"}`}</p>}</div></div>
        {line.isMarketPrice && <p className="mt-1 text-xs text-amber-800">{store.marketPriceNotice}
          {pricesVisible && line.recentDispatchPrice !== null && line.recentDispatchDate &&
            <> 최근 출고 {line.recentDispatchDate.slice(5)} {won(line.recentDispatchPrice)} (참고)</>}
        </p>}
        <div className="mt-2 flex gap-2 text-xs md:mt-0">
          <button disabled={busy} aria-pressed={preferences.get(line.productId)?.isFavorite === true}
            className="min-h-[44px] rounded border px-3" onClick={() => void changePreference(line.productId, "isFavorite")}>
            {preferences.get(line.productId)?.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
          <button disabled={busy} className="min-h-[44px] rounded border px-3"
            onClick={() => void changePreference(line.productId, "isHidden")}>
            {preferences.get(line.productId)?.isHidden ? "다시 표시" : "품목 숨기기"}</button>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 md:mt-0">
          <button disabled={busy} aria-label={`${line.name} 수량 줄이기`} className="min-h-[44px] min-w-[44px] rounded border" onClick={() => changeQuantity(line, -1)}>−</button>
          <span aria-label={`${line.name} 수량`} className="min-w-8 text-center">{cart[line.key] || 0}</span>
          <button disabled={busy} aria-label={`${line.name} 수량 늘리기`} className="min-h-[44px] min-w-[44px] rounded border" onClick={() => changeQuantity(line, 1)}>＋</button>
        </div>
      </li>)}</ul>
      <label className="block text-sm">요청 사항<textarea disabled={busy} className="mt-1 w-full rounded border p-2" maxLength={500}
        value={memo} onChange={(event) => { setMemo(event.target.value); retryKey.current = null; }} /></label>
      {pricesVisible && summary && <div className="rounded bg-slate-50 p-3 text-sm">
        <p>과세 공급가액 {won(summary.taxableSupply)} · 면세 공급가액 {won(summary.exemptSupply)}</p>
        <p>부가세 {won(summary.tax)} · 배송비 {won(summary.deliveryFee)}</p>
        <p className="font-semibold">확정된 품목 합계 {won(summary.knownTotal)}</p>
        {summary.marketCount > 0 && <p className="text-amber-800">시세 품목 {summary.marketCount}개는 가격 확정 후 합계가 달라집니다.</p>}
        {summary.belowMinimum && <p className="text-amber-800">최소 주문금액 {won(store.policy.minimumAmount)} 미달</p>}
      </div>}
      <Button disabled={!deliveryReady || !pricesReady || !store.canOrder || busy || !summary?.canSubmit} className="min-h-[48px] w-full"
        onClick={() => void submit()}>{busy ? "저장 중" : editing ? "수정 저장" : "후결제로 주문 신청"}</Button>
    </section>}
    {tab === "history" && <section className="space-y-3 p-4 md:p-6"><h2 className="font-semibold">주문 내역</h2>
      {!store.priceAvailable ? <p className="text-sm text-slate-600">문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다. 담당자에게 새 링크를 요청해 주세요.</p> :
        !pricesReady ? retryLoad : !data?.orders.length && <p className="text-sm text-slate-600">아직 주문이 없습니다.</p>}
      {pricesReady && store.priceAvailable && Boolean(data?.orders.length) && <table className="w-full border-collapse text-sm"><thead className="hidden bg-slate-50 md:table-header-group"><tr>
        <th scope="col" className="p-3 text-left">주문일 · 배송일</th><th scope="col" className="p-3 text-left">상태</th>
        <th scope="col" className="p-3 text-left">품목</th><th scope="col" className="p-3 text-left">합계</th><th scope="col" className="p-3 text-left">동작</th>
      </tr></thead><tbody>{data?.orders.map((order) => <tr key={order.id} className="block border-b py-2 md:table-row">
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">주문일 · 배송일</span><span>{kstDay(order.submittedAt)} · {order.deliveryDate || DELIVERY_CONFIRMATION_NOTICE}{order.authorLabel && <span className="block break-words">작성자: {order.authorLabel}</span>}</span></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">상태</span><span>{order.deliveryDate === null ? order.status === "cancelled" ? "취소됨" : "접수됨 · 배송일 확인 대기" : order.status}</span></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">품목</span><ul className="min-w-0 break-words">{order.lines.map((line, index) => <li key={index}>{line.product_name} {line.quantity}{line.sales_unit || "개"}{line.specification ? ` · ${line.specification}` : ""}{line.tax_type ? ` · ${line.tax_type === "exempt" ? "면세" : "과세"}` : ""} · {line.unit_price === null ? "단가 미정" : won(line.unit_price)}</li>)}</ul></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">합계</span><span>{won(order.knownTotal)}{order.marketPricePending ? " + 시세 품목 가격 미정" : ""}</span></td>
        <td className="p-2 md:p-3"><div className="flex gap-2"><button className="min-h-[44px] rounded border px-3" disabled={busy || !store.canOrder} onClick={() => fromOrder(order, false)}>다시 담기</button>
          {order.status === "submitted" && order.deliveryDate && store.priceAvailable && store.policy.weekdays.length > 0 &&
            canOrderForDelivery(order.deliveryDate, store.policy) &&
            <button className="min-h-[44px] rounded border px-3" disabled={busy || !store.canOrder} onClick={() => fromOrder(order, true)}>마감 전 수정</button>}</div></td>
      </tr>)}</tbody></table>}
      {pricesReady && store.priceAvailable && <div className="flex items-center justify-between gap-2 text-sm">
        <button disabled={data?.historyPage === 1 || busy} className="min-h-[44px] rounded border px-3 disabled:opacity-50"
          onClick={() => void load(deliveryDate, (data?.historyPage ?? 1) - 1).catch(() => setMessage("이전 내역을 불러오지 못했습니다."))}>이전</button>
        <span>{data?.historyPage ?? 1}페이지</span>
        <button disabled={!data?.historyHasMore || busy} className="min-h-[44px] rounded border px-3 disabled:opacity-50"
          onClick={() => void load(deliveryDate, (data?.historyPage ?? 1) + 1).catch(() => setMessage("다음 내역을 불러오지 못했습니다."))}>다음</button>
      </div>}</section>}
    {tab === "data" && <section className="space-y-4 p-4 md:p-6"><h2 className="font-semibold">매장 데이터</h2>
      <p className="text-sm text-slate-600">이 매장의 현재 주문 링크에서 확인할 수 있는 자료입니다.</p>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border p-4"><h3 className="font-semibold">최근 주문</h3>
          <p className="mt-2 text-2xl">{data?.orders.length ?? 0}건</p><p className="text-xs text-slate-600">현재 불러온 내역 페이지 기준</p>
          <button className="mt-3 min-h-[44px] rounded border px-3" onClick={() => setTab("history")}>주문 내역 보기</button></div>
        <div className="rounded border p-4"><h3 className="font-semibold">판매가 변동</h3>
          <p className="mt-2 text-2xl">{!pricesReady ? "배송일 가격 확인 필요" : hasPriceDirections ? `${changedPrices.length}품목` : "비교 정보 없음"}</p>
          <p className="text-xs text-slate-600">현재 게시본과 직전 게시본 비교</p>
          <button disabled={changedPrices.length === 0} className="mt-3 min-h-[44px] rounded border px-3" onClick={() => { setCategory("전체"); setProductView("all"); setPriceChangesOnly(true); setTab("order"); }}>변동 품목 보기</button></div>
        <div className="rounded border p-4"><h3 className="font-semibold">즐겨찾기</h3>
          <p className="mt-2 text-2xl">{data?.preferences.filter((item) => item.isFavorite && !item.isHidden).length ?? 0}품목</p>
          <button className="mt-3 min-h-[44px] rounded border px-3" onClick={() => { setPriceChangesOnly(false); setCategory("전체"); setProductView("favorites"); setTab("order"); }}>즐겨찾기 보기</button></div>
      </div>
      {storeLogin && <StoreKakaoLoginPanel access={storeLogin} />}
      {costAccess ? <StoreCostPanel access={costAccess} /> : <div className="rounded border p-4"><h3 className="font-semibold">매장 자체 원가관리</h3>
        <p role="status" className="mt-2 text-sm text-slate-600">현재 주문 링크에서는 원가 자료를 제공하지 않습니다. 원가관리는 로그인한 매장의 전용 주소에서 확인해 주세요.</p></div>}
    </section>}
    {tab === "info" && <section className="space-y-3 p-4 md:p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">매장 정보</h2>
      <button className="min-h-[44px] rounded border px-3" aria-expanded={showSettings} onClick={() => setShowSettings((value) => !value)}>설정</button></div>
      {showSettings && <div className="rounded border p-3 text-sm"><p>즐겨찾기와 숨긴 품목은 주문 탭에서 변경할 수 있습니다.</p>
        <button className="mt-2 min-h-[44px] rounded border px-3" onClick={() => { setCategory("전체"); setPriceChangesOnly(false); setProductView("hidden"); setTab("order"); }}>숨긴 품목 보기</button></div>}
      <p>매장: {store.customerName}</p><p>배송지: {store.deliveryAddress || "등록되지 않음"}</p>
      {loadError ? retryLoad : null}
      {!loading && !loadError && data?.memberManagement && <div className="space-y-2 rounded border p-3 text-sm" aria-label="구성원 관리 안내">
        {"href" in data.memberManagement
          ? <Link className="inline-flex min-h-[44px] items-center underline" href={data.memberManagement.href}>구성원 관리</Link>
          : <><p role="status">{data.memberManagement.message}</p><Button variant="outline" className="min-h-[44px]" onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>권한 다시 확인</Button></>}
      </div>}
      <p className="text-sm text-slate-600">배송지와 출입 정보 변경은 담당자에게 요청해 주세요.</p>
    </section>}
  </main>;
}
