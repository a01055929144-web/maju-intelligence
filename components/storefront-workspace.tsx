"use client";

import { formatWon } from "@/domains/shared/money";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { storeViewFrom, type StoreView } from "@/lib/store-navigation";
import { canOrderForDelivery, summarizeOrder, type DeliveryPolicy } from "@/domains/order/order-rules";
import { orderCutoffGuidance } from "@/domains/order/order-cutoff-guidance";
import type { PromotionAvailability } from "@/domains/order/promotion-availability";
import { StorefrontPromotionAvailability } from "./storefront-promotion-availability";
import { StorefrontOrderDetail } from "./storefront-order-detail";
import { Notice } from "./ui/notice";
import { StoreCostPanel, type StoreCostAccess } from "./store-cost-panel";
import { StoreKakaoLoginPanel, type StoreKakaoLogin } from "./store-kakao-entry";
import { Badge } from "./ui/badge";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { BottomActionBar } from "./ui/mobile/bottom-action-bar";
import { BottomSheet } from "./ui/mobile/bottom-sheet";
import { MobileListRow } from "./ui/mobile/mobile-list-row";
import { MoneyText } from "./ui/mobile/money-text";
import { Button } from "./ui/button";
import { SearchInput } from "./ui/search-input";
import { EmptyState, LoadingState } from "./ui/state";
import { publicSalesPriceDirection, type SalesPriceDirection } from "@/domains/pricing/storefront-price-direction";
import { DELIVERY_CONFIRMATION_NOTICE } from "../domains/order/delivery-confirmation";
import { deliveryEligibilityMessage } from "../domains/order/delivery-eligibility";
import { storeOrderStatusLabel } from "../domains/order/store-order-status";
import { fetchCatalogPage, SourceToggle, StorefrontCatalogPanel, type CatalogPage } from "./storefront-catalog-panel";
import type { CatalogLine } from "@/domains/pricing/storefront-catalog";

type Product = { key: string; productId: string; promotionId: string | null;
  name: string; category: string; brand: string; spec: string; unit: string;
  salesPriceDirection?: SalesPriceDirection;
  badge: string; taxType: "taxable" | "exempt"; unitPrice: number | null;
  priceIncludesTax: boolean; isMarketPrice: boolean; remaining: number | null;
  maximumQuantity: number | null;
  recentDispatchPrice: number | null; recentDispatchDate: string | null;
  productCutoff?: { cutoffAtKst: string; daysBefore: number; time: string } };
type Store = { source?: "document" | "catalog"; title: string; companyName: string; customerName: string;
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
  orderDetailsEnabled?: boolean;
  promotionAvailability?: Record<string, PromotionAvailability>;
  orderCutoffGuidance?: { serverNow: string };
  memberLogin?: StoreKakaoLogin;
  memberManagement?: { href: string } | { message: string };
  mobileCommon?: boolean;
  historyPage: number; historyHasMore: boolean; message?: string };
const won = formatWon;
const kstDay = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(value));

export function StorefrontWorkspace({ costAccess = null, storeLogin = null, portal = null, memberView, previewToken }: { costAccess?: StoreCostAccess; storeLogin?: StoreKakaoLogin | null; portal?: ReactNode; memberView?: ReactNode; previewToken?: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { const value = window.location.hash.slice(1); setToken(value === "store-address-management" ? "" : value.length <= 200 ? value : "invalid-link"); };
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (previewToken) return <StorefrontSession key={previewToken} token={previewToken} costAccess={null} storeLogin={null} portal={null} preview />;
  if (token === null) return <p role="status">매장 주소를 확인 중입니다.</p>;
  if (!token && memberView) return memberView;
  // A bearer link does not prove that its customer matches the signed-in store account.
  return <StorefrontSession key={token} token={token} costAccess={token ? null : costAccess} storeLogin={token ? null : storeLogin} portal={token ? null : portal} />;
}

function StorefrontSession({ token, costAccess, storeLogin, portal, preview = false }: { token: string; costAccess: StoreCostAccess; storeLogin: StoreKakaoLogin | null; portal: ReactNode; preview?: boolean }) {
  const [data, setData] = useState<Response | null>(null);
  const guidanceClock = useRef<{ serverNow: number; receivedAt: number } | null>(null);
  const [guidanceNow, setGuidanceNow] = useState<number | null>(null);
  useEffect(() => {
    if (!data?.orderCutoffGuidance || !guidanceClock.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const clock = guidanceClock.current;
      if (!clock) return;
      const now = clock.serverNow + performance.now() - clock.receivedAt;
      setGuidanceNow(now);
      timer = setTimeout(update, 60000 - now % 60000);
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [data?.orderCutoffGuidance]);
  const [tab, setTabState] = useState<StoreView>("home");
  // PC 사이드바(?view=)와 화면 탭을 맞춘다.
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  // CX-149: ?received=1 이면 전체 상품 링크에서 "받은 단가표에 있는 품목"만 보여 준다(서버가 조회 단계에서 거른다).
  const receivedOnly = searchParams.get("received") === "1";
  useEffect(() => { setTabState(storeViewFrom(viewParam)); }, [viewParam]);
  const setTab = (next: StoreView) => {
    setTabState(next);
    // 주소는 그대로 두고(#토큰·기존 쿼리 보호) 사이드바 강조만 알린다. 주소의 ?view=는 사이드바로 이동할 때만 바뀐다.
    window.dispatchEvent(new CustomEvent("store:tab", { detail: next }));
  };
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deliveryDate, setDeliveryDate] = useState("");
  const [memo, setMemo] = useState("");
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const [productView, setProductView] = useState<"all" | "favorites" | "hidden" | "complete">("all");
  const [category, setCategory] = useState("전체");
  const [orderView, setOrderView] = useState<"grid" | "table">("table");
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [cartOpen, setCartOpen] = useState(false);
  const tableView = desktop && orderView === "table";
  // CC-36a: "받은 단가표 | 전체 상품"(전체 상품이 열려 있는 매장만). 마지막에 쓴 쪽을 기억한다.
  const [catalog, setCatalog] = useState<CatalogPage | null>(null);
  // CC-36c-2b: 전체 상품 링크는 문서가 없어 품목을 /api/storefront/catalog 에서 받아 기존 주문 탭에 그대로 올린다.
  // 검색하면 목록이 바뀌므로, 담은 품목이 사라지지 않게 본 적 있는 품목은 모두 기억한다(catalogAll).
  const [catalogAll, setCatalogAll] = useState<Record<string, CatalogLine>>({});
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const catalogSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function applyCatalog(result: CatalogPage, append: boolean) {
    setCatalog(result);
    setCatalogAll((old) => { const next = { ...old }; for (const line of result.lines) next[line.productId] = line; return next; });
    setShownIds((old) => append ? [...old, ...result.lines.map((line) => line.productId)] : result.lines.map((line) => line.productId));
  }
  function searchCatalog(value: string) {
    setCatalogQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const sequence = ++catalogSeq.current;
    searchTimer.current = setTimeout(() => {
      void fetchCatalogPage(token, 1, value, receivedOnly).then((result) => {
        if (sequence !== catalogSeq.current) return;
        if (result) applyCatalog(result, false); else setMessage("전체 상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    }, 300);
  }
  async function moreCatalog() {
    if (!catalog) return;
    const sequence = ++catalogSeq.current;
    const result = await fetchCatalogPage(token, catalog.page + 1, catalogQuery, receivedOnly);
    if (sequence !== catalogSeq.current) return;
    if (result) applyCatalog(result, true); else setMessage("전체 상품을 더 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const [source, setSourceState] = useState<"doc" | "all">("doc");
  useEffect(() => {
    if (!token) return;
    void fetchCatalogPage(token, 1, "", receivedOnly).then((page) => { if (page) applyCatalog(page, false); });
    try { if (localStorage.getItem("maju:store:source") === "all") setSourceState("all"); } catch { /* 저장소 없음 */ }
  }, [token, receivedOnly]);
  const setSource = (next: "doc" | "all") => { setSourceState(next); try { localStorage.setItem("maju:store:source", next); } catch { /* 저장소 없음 */ } };
  const catalogMode = data?.store.source === "catalog";
  const showCatalog = !catalogMode && Boolean(catalog) && source === "all";
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
      const serverNow = Date.parse(result.orderCutoffGuidance?.serverNow ?? "");
      guidanceClock.current = Number.isFinite(serverNow) ? { serverNow, receivedAt: performance.now() } : null;
      setGuidanceNow(Number.isFinite(serverNow) ? serverNow : null);
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
  const baseStore = data?.store;
  const store = baseStore && catalogMode ? { ...baseStore, lines: Object.values(catalogAll).flatMap((line): Product[] =>
    // 가격이 없는 일반 품목은 주문할 수 없으니 올리지 않는다(시세 품목은 가격 미정으로 주문 가능).
    line.isMarket || line.price !== null ? [{ key: `${line.productId}:`, productId: line.productId, promotionId: null, name: line.name,
      category: line.category, brand: line.brand, spec: line.spec, unit: line.unit, badge: line.badge ? `${line.badge}${line.endsOn ? ` ~${line.endsOn.slice(5).replace("-", "/")}` : ""}` : "", taxType: line.taxType,
      unitPrice: line.isMarket ? null : line.price, priceIncludesTax: line.priceIncludesTax === true, isMarketPrice: line.isMarket, remaining: null,
      maximumQuantity: null, recentDispatchPrice: line.lastDispatch?.price ?? null, recentDispatchDate: line.lastDispatch?.date ?? null }] : []) } : baseStore;
  const deliveryReady=Boolean(store&&(store.deliveryEligibility?.eligible??true)&&store.policy.weekdays.length>0);
  const pricesReady = !loading && !loadError && Boolean(deliveryDate) && deliveryDate === store?.selectedDeliveryDate;
  const pricesVisible = pricesReady && Boolean(store?.priceAvailable);
  const cutoff = data?.orderCutoffGuidance && store?.canOrder && deliveryReady && pricesVisible && guidanceNow !== null
    ? orderCutoffGuidance(deliveryDate, store.policy, new Date(guidanceNow)) : null;
  const confirmingAfterCutoff = cutoff?.open === false && Boolean(retryKey.current);
  const productCutoffPassed = (line: Product) => Boolean(line.productCutoff && guidanceNow !== null && Date.parse(line.productCutoff.cutoffAtKst) <= guidanceNow);
  const productCutoffLabel = (line: Product) => line.productCutoff
    ? productCutoffPassed(line) ? "마감 지남 — 다음 배송일로" : `이 상품 ${line.productCutoff.daysBefore}일 전 ${line.productCutoff.time} 마감`
    : "";
  const preferences = new Map(data?.preferences.map((item) => [item.productId, item]) ?? []);
  const categories = Array.from(new Set(store?.lines.map((line) => line.category || "미분류") ?? [])).sort((a, b) => a.localeCompare(b, "ko"));
  const hasPriceDirections = pricesReady && Boolean(store?.priceAvailable && store.lines.some(line => publicSalesPriceDirection(line.salesPriceDirection)));
  const changedPrices = hasPriceDirections ? store?.lines.filter((line) => !preferences.get(line.productId)?.isHidden &&
    (line.salesPriceDirection === "up" || line.salesPriceDirection === "down")) ?? [] : [];
  const query = documentQuery.trim().toLocaleLowerCase("ko-KR");
  const visibleProducts = (store?.lines.filter((line) => {
    const preference = preferences.get(line.productId);
    const matchesView = productView === "complete" ? true : productView === "hidden" ? preference?.isHidden === true :
      productView === "favorites" ? preference?.isFavorite === true && !preference.isHidden :
        !preference?.isHidden || (cart[line.key] ?? 0) > 0;
    const matchesQuery = catalogMode || !query || [line.name, line.brand, line.spec, line.unit].some(value => value.toLocaleLowerCase("ko-KR").includes(query));
    return matchesView && matchesQuery && (!catalogMode || shownIds.includes(line.productId)) && (category === "전체" || (line.category || "미분류") === category) &&
      (!priceChangesOnly || line.salesPriceDirection === "up" || line.salesPriceDirection === "down");
  }) ?? []).sort((a, b) => {
    if (sortBy === "price" && (a.unitPrice === null || b.unitPrice === null)) {
      return Number(a.unitPrice === null) - Number(b.unitPrice === null);
    }
    const order = sortBy === "price" ? a.unitPrice! - b.unitPrice! : a.name.localeCompare(b.name, "ko");
    return ascending ? order : -order;
  });
  const selected = store?.lines.filter((line) => (cart[line.key] ?? 0) > 0) ?? [];
  const productCutoffBlocked = selected.some(productCutoffPassed);
  let summary: ReturnType<typeof summarizeOrder> | null = null;
  try {
    if (store && selected.length) summary = summarizeOrder(selected.map((line) => ({
      productId: line.productId, quantity: cart[line.key],
      unitPrice: line.unitPrice, taxType: line.taxType,
      priceIncludesTax: line.priceIncludesTax,
    })), store.policy);
  } catch { /* The server returns a field-level order error on submission. */ }
  const promotionState = (line: Product): PromotionAvailability | null => data?.promotionAvailability && line.promotionId
    ? data.promotionAvailability[line.promotionId] ?? { state: "unavailable" } : null;
  const maxQuantity = (line: Product) => {
    const state = promotionState(line);
    if (state && !editing) return state.state === "known" ? Math.min(100000, state.remaining ?? 100000, state.storeLimit ?? 100000) : 0;
    return Math.max(0, Math.min(100000, line.maximumQuantity ?? 100000, line.remaining ?? 100000));
  };
  const promotionBlocked = !editing && !retryKey.current && selected.some(line => promotionState(line) && (cart[line.key] ?? 0) > maxQuantity(line));
  const confirmingPromotion = Boolean(retryKey.current && selected.some(line => promotionState(line)));
  function changeQuantity(line: Product, delta: number) {
    if (delta > 0 && productCutoffPassed(line)) { setMessage("마감이 지난 품목입니다. 다음 배송일을 선택해 주세요."); return; }
    if (promotionState(line)) {
      const current = cart[line.key] ?? 0;
      if (delta > 0 && current >= maxQuantity(line)) return;
      setQuantity(line, Math.max(0, current + delta));
      return;
    }
    retryKey.current = null;
    setCart(old => ({ ...old, [line.key]: Math.max(0, Math.min(maxQuantity(line), (old[line.key] || 0) + delta)) }));
  }
  function setQuantity(line: Product, value: number | null) {
    if (busy) return;
    if ((value ?? 0) > (cart[line.key] ?? 0) && productCutoffPassed(line)) { setMessage("마감이 지난 품목입니다. 다음 배송일을 선택해 주세요."); return; }
    if (value !== null && Number(value.toFixed(3)) !== value) {
      setMessage("수량은 소수 셋째 자리까지 입력해 주세요.");
      return;
    }
    if (promotionState(line)) {
      const current = cart[line.key] ?? 0, next = Math.max(0, value ?? 0);
      if (next === current) return;
      if (next > current && next > maxQuantity(line)) { setMessage("행사 잔량과 매장당 총 한도를 확인해 주세요. 기존 주문도 한도에 포함됩니다."); return; }
      retryKey.current = null;
      setCart(old => ({ ...old, [line.key]: next }));
      return;
    }
    retryKey.current = null;
    setCart(old => ({ ...old, [line.key]: Math.max(0, Math.min(maxQuantity(line), value ?? 0)) }));
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
      const result = await response.json() as { message?: string; orderDocumentStatus?: "confirmed" | "failed" };
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
    const available = new Set(store?.lines.filter(line => !productCutoffPassed(line)).map((line) => line.key) ?? []);
    const copied = order.lines.filter((line) => available.has(`${line.product_id}:${line.promotion_id ?? ""}`));
    const missing = order.lines.length - copied.length;
    if (edit && missing) {
      setMessage(`현재 문서에서 ${missing}개 품목을 찾을 수 없어 이 주문을 수정할 수 없습니다. 담당자에게 문의해 주세요.`);
      return;
    }
    setCart(Object.fromEntries(copied.map((line) => [
      `${line.product_id}:${line.promotion_id ?? ""}`, Number(line.quantity),
    ])));
    setCartOpen(false);
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
    if (promotionBlocked) { setMessage("행사 잔량을 다시 확인하고 담은 수량을 조정해 주세요."); return; }
    if (productCutoffBlocked) { setMessage("마감이 지난 품목이 있습니다. 빼거나 다음 배송일을 선택해 주세요."); return; }
    if (data?.orderCutoffGuidance && !retryKey.current) {
      const clock = guidanceClock.current;
      if (!clock) { setMessage("마감 정보를 다시 불러온 뒤 주문해 주세요."); return; }
      const current = orderCutoffGuidance(deliveryDate, store.policy, new Date(clock.serverNow + performance.now() - clock.receivedAt));
      if (!current.open) { setGuidanceNow(clock.serverNow + performance.now() - clock.receivedAt); setMessage(current.message); return; }
    }
    submitting.current = true;
    setBusy(true); setMessage("");
    if (!retryKey.current) retryKey.current = crypto.randomUUID();
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, deliveryDate, memo, idempotencyKey: retryKey.current,
          orderId: editing?.id ?? null, expectedRevision: editing?.revision ?? null,
          lines: selected.map((line) => ({ productId: line.productId,
            promotionId: line.promotionId, quantity: cart[line.key] })) }) });
      const result = await response.json() as { message?: string; orderDocumentStatus?: "confirmed" | "failed" };
      if (!response.ok) {
        if (response.status === 403 && /권한.*변경/.test(result.message || "")) setMemberAccessChanged(true);
        throw new Error(result.message || "주문을 저장하지 못했습니다.");
      }
      retryKey.current = null; setCart({}); setEditing(null); setMemo(""); setCartOpen(false);
      setTab("history");
      try {
        await load(undefined, 1);
        setMessage(result.orderDocumentStatus === "failed"
          ? "주문은 저장됐습니다. 전표 연결은 유통사에 확인해 주세요."
          : "주문을 받았습니다. 주문 내역에서 확인해 주세요.");
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
  if (preview) {
    if (loadError) return retryLoad;
    if (!store || loading) return <LoadingState bare label="받은 문서를 불러오는 중입니다." />;
    return <section aria-label="받은 문서" className="space-y-3 rounded border bg-white p-4">
      <h3 className="text-lg font-semibold">{store.title}</h3>
      <p className="text-sm text-slate-600">{store.companyName} · 게시 버전 {store.version} · {store.validUntil}까지</p>
      {!pricesVisible && <p role="status">현재 판매가를 확인할 수 없습니다. 발행 회사에 문의해 주세요.</p>}
      {store.lines.length ? <ul className="divide-y">{store.lines.map(line =>
        <li className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3 text-sm" key={line.key}>
          <div className="min-w-0 break-words"><strong>{line.name}</strong><p>{[line.spec, line.unit].filter(Boolean).join(" · ")}</p></div>
          {pricesVisible && <span>{line.isMarketPrice ? "시가" : line.unitPrice === null ? "—" : won(line.unitPrice)}</span>}
        </li>)}</ul> : <EmptyState bare message="표시할 품목이 없습니다." />}
      {store.canOrder && pricesVisible && <Link className="maju-button-primary inline-flex min-h-11 items-center" href={`/store?view=order#${token}`}>이 단가표로 주문하기</Link>}
    </section>;
  }
  if (!store) return <main className="mx-auto max-w-6xl space-y-4 p-5">{portal}{storeLogin && <StoreKakaoLoginPanel access={storeLogin} />}{costAccess && <div id="store-costs"><h2 className="text-lg font-semibold">매장 원가관리</h2><StoreCostPanel access={costAccess} /></div>}{token ? retryLoad : !portal ? <p role="status">주문 링크 또는 담당자에게 받은 매장 전용 주소를 열어 주세요.</p> : null}</main>;
  const mobileOrder = data?.mobileCommon === true && !desktop && tab === "order" && !showCatalog;
  const promotionInfo = (line: Product, retry = true) => {
    const state = pricesVisible && promotionState(line);
    return state ? <StorefrontPromotionAvailability availability={state} unit={line.unit} busy={busy || loading}
      onRetry={retry ? () => void load(deliveryDate || undefined).catch(() => undefined) : undefined} /> : null;
  };
  const messagePanel = message && <div role="status" className="mx-4 mt-3 space-y-2 rounded border p-3 text-sm"><p>{message}</p>
        {memberAccessChanged && <Button variant="outline" className="min-h-[44px]" disabled={busy || loading}
          onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>로그인 상태 다시 확인</Button>}
      </div>;
  const cutoffNotice = cutoff && <section aria-label="주문 마감 안내"><Notice kind={cutoff.open ? "success" : "error"}>
    <span className="block">{store.companyName} · {cutoff.label}</span>
    <span className="block">{confirmingAfterCutoff ? "새 주문은 마감됐습니다. 이미 보낸 주문의 결과를 확인해 주세요." : cutoff.message}</span>
  </Notice></section>;
  const cartContent = <>
      <p className="text-sm text-slate-600">{store.companyName}{deliveryDate ? ` · 배송 ${deliveryDate}` : ""}</p>
      {mobileOrder && cartOpen && cutoffNotice}
      {pricesVisible && selected.some(line => promotionState(line)) && <Button variant="outline" className="min-h-[52px]" disabled={busy || loading}
        onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>행사 잔량 다시 확인</Button>}
      {selected.length ? <ul className="max-h-48 divide-y overflow-y-auto text-sm">{selected.map(line =>
        <li className="flex justify-between gap-2 py-2" key={line.key}>
          <div className="min-w-0 break-words"><span>{line.name} · {cart[line.key]}{line.unit}</span>
            {line.productCutoff && <span className="block text-xs text-amber-800">{productCutoffLabel(line)}</span>}{promotionInfo(line)}</div>
          <button aria-label={`${line.name} 장바구니에서 빼기`} className="min-h-11 shrink-0 px-1 underline" disabled={busy} onClick={() => setQuantity(line, 0)} type="button">빼기</button>
        </li>)}</ul> : <p className="text-sm text-slate-500">담은 품목이 없습니다.</p>}
      {data?.orders[0] && !editing && <Button className="min-h-11 w-full" variant="outline" disabled={busy || !store.canOrder || !pricesReady}
        onClick={() => fromOrder(data.orders[0], false)}>최근 주문 다시 담기</Button>}
      <label className="block text-sm">요청 사항<textarea disabled={busy} className="mt-1 w-full rounded border p-2 text-base md:text-sm" maxLength={500}
        value={memo} onChange={(event) => { setMemo(event.target.value); retryKey.current = null; }} /></label>
      {pricesVisible && summary && <div className="rounded bg-slate-50 p-3 text-sm">
        <p>과세 공급가액 {won(summary.taxableSupply)} · 면세 공급가액 {won(summary.exemptSupply)}</p>
        <p>부가세 {won(summary.tax)} · 배송비 {won(summary.deliveryFee)}</p>
        <p className="font-semibold">확정된 품목 합계 {mobileOrder ? <MoneyText value={summary.knownTotal} /> : won(summary.knownTotal)}</p>
        {summary.marketCount > 0 && <p className="text-amber-800">시세 품목 {summary.marketCount}개는 가격 확정 후 합계가 달라집니다.</p>}
        {summary.belowMinimum && <p className="text-amber-800">최소 주문금액 {won(store.policy.minimumAmount)} 미달</p>}
      </div>}
      {promotionBlocked && <p role="status">행사 잔량을 다시 확인하고 담은 수량을 조정해 주세요. 담은 수량은 유지됩니다.</p>}
      {productCutoffBlocked && <p role="status">마감 지남 — 품목을 빼거나 다음 배송일로 바꿔 주세요.</p>}
      {editing && selected.some(line => promotionState(line)) && <p>주문 수정은 기존 예약분을 포함해 서버에서 다시 확인합니다.</p>}
      <Button disabled={!deliveryReady || !pricesReady || !store.canOrder || busy || !summary?.canSubmit || promotionBlocked || productCutoffBlocked || (cutoff?.open === false && !confirmingAfterCutoff)} className="min-h-[48px] w-full"
        onClick={() => void submit()}>{busy ? "저장 중" : confirmingAfterCutoff || confirmingPromotion ? "이전 주문 결과 확인" : editing ? "수정 저장" : "후결제로 주문 신청"}</Button>
  </>;
  return <main className="mx-auto min-h-dvh max-w-6xl bg-white pb-24 text-slate-900 md:pb-8">
    <header className="sticky top-0 z-10 border-b bg-white p-4 md:px-6">
      {mobileOrder && <button className="min-h-11 text-sm font-medium underline" type="button"
        onClick={() => { setCartOpen(false); setTab("home"); }}>매장 홈으로</button>}
      <p className="text-xs text-slate-600">{store.companyName} · {store.customerName}</p>
      <h1 className="text-lg font-semibold">{store.title}</h1>
      {store.notice && <p className="mt-2 rounded bg-blue-50 p-2 text-sm">{store.notice}</p>}
      {!store.priceAvailable && <p className="mt-2 rounded bg-amber-50 p-2 text-sm">문서 유효기간이 지났습니다. 품목은 볼 수 있지만 가격과 주문은 잠시 숨겼습니다.</p>}
    </header>
    {!mobileOrder && <nav aria-label="매장 메뉴" className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-xl -translate-x-1/2 grid-cols-5 border-t bg-white text-sm sm:hidden">
      {(["home", "order", "history", "data", "info"] as const).map((item, index) =>
        <button key={item} className={`min-h-14 ${tab === item ? "font-semibold text-blue-700" : "text-slate-600"}`}
          onClick={() => setTab(item)}>{["홈", "주문", "내역", "데이터", "내 정보"][index]}</button>)}</nav>}
      {!(mobileOrder && cartOpen) && messagePanel}
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
        <Button className="min-h-[44px]" onClick={() => { setCategory("전체"); setDocumentQuery(""); setProductView("complete"); setPriceChangesOnly(false); setTab("order"); setMessage("이 발행 문서의 주문 가능 품목 전체입니다. 숨김·즐겨찾기·분류·가격 변동 필터를 해제했습니다."); }} type="button">주문 품목 전체 보기</Button>
        <button className="min-h-14 rounded bg-slate-900 px-4 text-white" onClick={() => { setCategory("전체"); setProductView("all"); setPriceChangesOnly(false); setTab("order"); }}>주문하기</button>
        <button className="min-h-14 rounded border px-4" onClick={() => setTab("history")}>지난 주문 다시 담기</button>
      </div>
      <button className="min-h-[44px] rounded border px-4 text-sm" onClick={() => { setCategory("전체"); setPriceChangesOnly(false); setProductView("favorites"); setTab("order"); }}>
        즐겨찾기 품목 보기</button>
      <p className="text-sm text-slate-600">주문은 후결제로 접수됩니다. 시세 품목은 출고 전 단가가 확정됩니다.</p>
      <p className="text-sm">배송지: {store.deliveryAddress || "등록된 주소가 없습니다. 거래처 담당자에게 확인해 주세요."}</p>
    </section>}
    {tab === "order" && showCatalog && catalog && <section className="space-y-4 p-4 md:p-6">
      <SourceToggle onChange={setSource} source={source} />
      <StorefrontCatalogPanel initial={catalog} token={token} />
    </section>}
    {tab === "order" && !showCatalog && <section className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-4">
      {catalog && !catalogMode ? <SourceToggle onChange={setSource} source={source} /> : null}
      {pricesVisible && visibleProducts.some(line => publicSalesPriceDirection(line.salesPriceDirection)) && <p className="text-xs text-slate-600">판매가 등락은 이전에 게시된 단가와 비교합니다.</p>}
      <h2 className="font-semibold">{editing ? "주문 수정" : "주문하기"}</h2>
      {!(mobileOrder && cartOpen) && cutoffNotice}
      {!deliveryReady && <section className="space-y-2 rounded border p-3 text-sm" aria-label="배송 요일 설정 안내">
        <p role="status">{deliveryEligibilityMessage(store.deliveryEligibility&&!store.deliveryEligibility.eligible?store.deliveryEligibility.reason:"weekdays_unconfigured")}</p>
        <Button variant="outline" className="min-h-[44px]" disabled={busy || loading} onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>배송 설정 다시 확인</Button>
      </section>}
      {!pricesReady ? retryLoad : null}
      {deliveryReady && <p aria-live="polite">배송 가능 요일: {store.policy.weekdays.map(day=>["일","월","화","수","목","금","토"][day]).join("·")}요일</p>}
      <label className="block text-sm">배송일
        <input disabled={busy||!deliveryReady} className="mt-1 min-h-[44px] w-full rounded border p-2" type="date" value={deliveryDate}
          min={store.nextDeliveryDate || undefined}
          onChange={(event) => { const day = event.target.value; setDeliveryDate(day); retryKey.current = null;
            if (day) void load(day).catch(() => undefined);
            else { ++loadSequence.current; setLoading(false); setLoadError("배송일을 선택해 주세요."); } }} /></label>
      <p className="text-sm text-slate-600">배송 권역·가능 요일·휴일·마감은 주문 제출 직전에 서버에서 다시 확인합니다.</p>
      {catalogMode ? <SearchInput aria-label="상품 검색" className="w-full max-sm:!h-11" onChange={searchCatalog}
        placeholder="상품 이름 검색" value={catalogQuery} /> : <>
      <SearchInput aria-label="상품 검색" className="w-full max-sm:!h-11" onChange={setDocumentQuery} placeholder="상품 이름·규격 검색" value={documentQuery} />
      <div role="group" aria-label="품목 보기" className="flex gap-2 text-sm">
        {(["all", "favorites", "hidden"] as const).map((view) =>
          <button key={view} aria-pressed={productView === view} className="min-h-[44px] rounded border px-3"
            onClick={() => setProductView(view)}>{view === "all" ? "전체" : view === "favorites" ? "즐겨찾기" : "숨긴 품목"}</button>)}
      </div></>}
      <div role="group" aria-label="품목 대분류" className="flex gap-2 overflow-x-auto pb-1 text-sm">
        {["전체", ...categories].map((item) => <button key={item} aria-pressed={category === item}
          className={`min-h-[44px] shrink-0 rounded border px-3 ${category === item ? "border-blue-700 text-blue-700" : ""}`}
          onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!catalogMode && <button aria-pressed={priceChangesOnly} className="min-h-[44px] rounded border px-3"
          onClick={() => setPriceChangesOnly((value) => !value)}>판매가 변동만</button>}
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
      {visibleProducts.length === 0 && <EmptyState message="해당 조건의 품목이 없습니다." description="분류나 필터를 바꿔 주세요." />}
      {data?.promotionAvailability && pricesVisible && !catalogMode && <section aria-label="행사 잔량 확인" className="space-y-2 text-sm">
        <p>행사 잔량은 기존 주문의 예약분을 뺀 수량입니다. 담기만으로는 예약되지 않으며 주문할 때 다시 확인합니다.</p>
        <Button variant="outline" className="min-h-[52px]" disabled={busy || loading} onClick={() => void load(deliveryDate || undefined).catch(() => undefined)}>행사 잔량 다시 확인</Button>
      </section>}
      {tableView && visibleProducts.length > 0 && <div>
        <StoreOrderTable rows={visibleProducts} companyName={store.companyName} cart={cart} busy={busy}
          promotionInfo={data?.promotionAvailability && pricesVisible && !catalogMode ? line => promotionInfo(line, false) : undefined}
          pricesVisible={pricesVisible} catalogMode={catalogMode} preferences={preferences}
          marketNotice={store.marketPriceNotice} onQuantity={setQuantity} onPreference={changePreference}
          productCutoffLabel={productCutoffLabel}
          settingsKey={`store-order:${store.companyName}:${store.customerName}`} />
      </div>}
      {!tableView && <ul aria-label="주문 품목" className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{visibleProducts.map((line) => <li key={line.key} className="rounded border p-3">
        {mobileOrder ? <MobileListRow title={line.name}
          subtitle={[line.brand, line.spec, line.unit, line.badge, productCutoffLabel(line)].filter(Boolean).join(" · ")}
          trailing={!pricesVisible ? "가격 확인 필요" : line.isMarketPrice ? "시가" :
            line.unitPrice === null ? "가격 문의" : <MoneyText value={line.unitPrice} />} /> : <>
        <div className="flex justify-between gap-2"><div><strong>{line.name}</strong>
          {line.badge && <span className="ml-2 rounded bg-amber-50 px-2 text-xs">{line.badge}</span>}
          {line.productCutoff && <Badge className="ml-2">{productCutoffLabel(line)}</Badge>}
          <p className="text-sm text-slate-600">{[line.brand, line.spec, line.unit].filter(Boolean).join(" · ")}</p>
          {pricesVisible && (line.salesPriceDirection === "up" || line.salesPriceDirection === "down" || line.salesPriceDirection === "flat") ? <Badge>판매가 {line.salesPriceDirection === "up" ? "상승" : line.salesPriceDirection === "down" ? "하락" : "보합"}</Badge> : null}</div>
          <div className="text-right text-sm">{!pricesVisible ? "배송일 가격 확인 필요" : line.isMarketPrice ? "시세 · 가격 미정" :
            line.unitPrice === null ? "가격 문의" : won(line.unitPrice)}
            {pricesVisible && <p className="text-xs text-slate-600">{line.taxType === "exempt" ? "면세" : `과세 · 부가세 ${line.priceIncludesTax ? "포함" : "별도"}`}</p>}</div></div>
        </>}
        {line.isMarketPrice && <p className="mt-1 text-xs text-amber-800">{store.marketPriceNotice}
          {pricesVisible && line.recentDispatchPrice !== null && line.recentDispatchDate &&
            <> 최근 출고 {line.recentDispatchDate.slice(5)} {won(line.recentDispatchPrice)} (참고)</>}
        </p>}
        {promotionInfo(line)}
        {!catalogMode && <div className="mt-2 flex gap-2 text-xs md:mt-0">
          <button disabled={busy} aria-pressed={preferences.get(line.productId)?.isFavorite === true}
            className="min-h-[44px] rounded border px-3" onClick={() => void changePreference(line.productId, "isFavorite")}>
            {preferences.get(line.productId)?.isFavorite ? "즐겨찾기 해제" : "즐겨찾기"}</button>
          <button disabled={busy} className="min-h-[44px] rounded border px-3"
            onClick={() => void changePreference(line.productId, "isHidden")}>
            {preferences.get(line.productId)?.isHidden ? "다시 표시" : "품목 숨기기"}</button>
        </div>}
        <div className="mt-3 flex items-center justify-end gap-2 md:mt-0">
          <button disabled={busy} aria-label={`${line.name} 수량 줄이기`} className="min-h-[44px] min-w-[44px] rounded border" onClick={() => changeQuantity(line, -1)}>−</button>
          <span aria-label={`${line.name} 수량`} className="min-w-8 text-center">{cart[line.key] || 0}</span>
          <button disabled={busy || productCutoffPassed(line) || Boolean(promotionState(line) && (cart[line.key] ?? 0) >= maxQuantity(line))} aria-label={`${line.name} 수량 늘리기`} className="min-h-[44px] min-w-[44px] rounded border" onClick={() => changeQuantity(line, 1)}>＋</button>
        </div>
      </li>)}</ul>}
      {catalogMode && catalog?.hasMore && <button className="min-h-[44px] w-full rounded border text-sm font-bold" disabled={busy} onClick={() => void moreCatalog()} type="button">상품 더 보기</button>}
      </div>
      {mobileOrder ? <>
        <div className="fixed inset-x-0 bottom-0 z-20">
          <BottomActionBar onClick={() => setCartOpen(true)}>장바구니 확인 · {selected.length}개 품목</BottomActionBar>
        </div>
        {cartOpen && <BottomSheet title="장바구니" onClose={() => setCartOpen(false)}>
          <div className="space-y-3">{messagePanel}{cartContent}</div>
        </BottomSheet>}
      </> : <aside aria-label="장바구니" className="min-w-0 space-y-3 rounded-lg border bg-white p-3 xl:sticky xl:top-24 xl:self-start">
        <h3 className="font-semibold">장바구니</h3>
        {cartContent}
      </aside>}
    </section>}
    {tab === "history" && <section className="space-y-3 p-4 md:p-6"><h2 className="font-semibold">주문 내역</h2>
      {!store.priceAvailable ? <p className="text-sm text-slate-600">문서 유효기간이 지나 주문 금액과 내역을 숨겼습니다. 담당자에게 새 링크를 요청해 주세요.</p> :
        !pricesReady ? retryLoad : !data?.orders.length && <p className="text-sm text-slate-600">아직 주문이 없습니다.</p>}
      {pricesReady && store.priceAvailable && Boolean(data?.orders.length) && <table className="w-full border-collapse text-sm"><thead className="hidden bg-slate-50 md:table-header-group"><tr>
        <th scope="col" className="p-3 text-left">주문일 · 배송일</th><th scope="col" className="p-3 text-left">상태</th>
        <th scope="col" className="p-3 text-left">품목</th><th scope="col" className="p-3 text-left">합계</th><th scope="col" className="p-3 text-left">동작</th>
      </tr></thead><tbody>{data?.orders.map((order) => <Fragment key={order.id}><tr data-store-order-id={order.id} className="block border-b py-2 md:table-row">
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">주문일 · 배송일</span><span>{kstDay(order.submittedAt)} · {order.deliveryDate || DELIVERY_CONFIRMATION_NOTICE}{order.authorLabel && <span className="block break-words">작성자: {order.authorLabel}</span>}</span></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">상태</span><span>{order.deliveryDate === null ? order.status === "cancelled" ? "취소됨" : "접수됨 · 배송일 확인 대기" : storeOrderStatusLabel(order.status)}</span></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">품목</span><ul className="min-w-0 break-words">{order.lines.map((line, index) => <li key={index}>{line.product_name} {line.quantity}{line.sales_unit || "개"}{line.specification ? ` · ${line.specification}` : ""}{line.tax_type ? ` · ${line.tax_type === "exempt" ? "면세" : "과세"}` : ""} · {line.unit_price === null ? "단가 미정" : won(line.unit_price)}</li>)}</ul></td>
        <td className="flex justify-between gap-2 p-2 md:table-cell md:p-3"><span className="text-slate-500 md:hidden">합계</span><span>{won(order.knownTotal)}{order.marketPricePending ? " + 시세 품목 가격 미정" : ""}</span></td>
        <td className="p-2 md:p-3"><div className="flex flex-wrap gap-2"><button className="min-h-[44px] rounded border px-3" disabled={busy || !store.canOrder} onClick={() => fromOrder(order, false)}>다시 담기</button>
          {order.status === "submitted" && order.deliveryDate && store.priceAvailable && store.policy.weekdays.length > 0 &&
            canOrderForDelivery(order.deliveryDate, store.policy) &&
            <button className="min-h-[44px] rounded border px-3" disabled={busy || !store.canOrder} onClick={() => fromOrder(order, true)}>마감 전 수정</button>}</div></td>
      </tr>{data.orderDetailsEnabled === true && <tr className="block md:table-row"><td colSpan={5} className="block min-w-0 py-2 md:table-cell">
        <StorefrontOrderDetail key={`${token}:${order.id}:${order.revision}:${data.orderDetailsEnabled === true}`}
          token={token} order={order} documentReadEnabled={data.orderDetailsEnabled === true} />
      </td></tr>}</Fragment>)}</tbody></table>}
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

function StoreOrderTable({ rows, companyName, cart, busy, pricesVisible, catalogMode, preferences, marketNotice, onQuantity, onPreference, settingsKey, promotionInfo, productCutoffLabel }: {
  rows: Product[];
  companyName: string;
  cart: Record<string, number>;
  busy: boolean;
  pricesVisible: boolean;
  catalogMode: boolean;
  preferences: Map<string, Preference>;
  marketNotice: string;
  onQuantity: (line: Product, value: number | null) => void;
  onPreference: (id: string, key: "isFavorite" | "isHidden") => Promise<void>;
  settingsKey: string;
  promotionInfo?: (line: Product) => ReactNode;
  productCutoffLabel: (line: Product) => string;
}) {
  const qty = (line: Product) => cart[line.key] ?? 0;
  const marketCount = rows.filter(line => line.isMarketPrice && qty(line) > 0).length;
  const columns: CommonTableColumn<Product>[] = [
    ...(!catalogMode ? [{
      key: "favorite", label: "★", width: 58, sortable: false,
      value: (line: Product) => preferences.get(line.productId)?.isFavorite ? "★" : "☆",
      render: (line: Product) => {
        const favorite = preferences.get(line.productId)?.isFavorite === true;
        return <button aria-label={`${line.name} 즐겨찾기`} aria-pressed={favorite} className="min-h-8 px-1 text-lg" disabled={busy} onClick={() => void onPreference(line.productId, "isFavorite")} type="button">{favorite ? "★" : "☆"}</button>;
      },
    }] : []),
    { key: "name", label: "품목", width: 150, value: line => line.name, render: line => <>
      <strong>{line.name}</strong>{line.badge && <span className="ml-1 text-xs text-amber-800">{line.badge}</span>}
      {pricesVisible && publicSalesPriceDirection(line.salesPriceDirection) && <Badge className="ml-1">
        판매가 {line.salesPriceDirection === "up" ? "상승" : line.salesPriceDirection === "down" ? "하락" : "보합"}
      </Badge>}
      {line.productCutoff && <Badge className="ml-1">{productCutoffLabel(line)}</Badge>}
    </> },
    { key: "company", label: "유통사", width: 110, value: () => companyName },
    ...(promotionInfo ? [{ key: "promotionAvailability", label: "행사 수량", width: 260, sortable: false,
      value: (line: Product) => line.promotionId ? "행사" : "", render: promotionInfo }] : []),
    { key: "spec", label: "규격", width: 95, value: line => [line.brand, line.spec, line.unit].filter(Boolean).join(" · ") },
    { key: "unit", label: "단위", width: 60, value: line => line.unit },
    { key: "price", label: "단가", width: 110, align: "right", value: line => pricesVisible ? line.unitPrice : null,
      render: line => !pricesVisible ? "확인 필요" : line.isMarketPrice ? <span title={marketNotice}>시가{line.recentDispatchPrice !== null && line.recentDispatchDate && <span className="block text-xs text-slate-500">최근 {line.recentDispatchDate.slice(5)} {won(line.recentDispatchPrice)}</span>}</span> : line.unitPrice === null ? "가격 문의" : <>{won(line.unitPrice)}<span className="block text-xs text-slate-500">{line.taxType === "exempt" ? "면세" : line.priceIncludesTax ? "과세 · 부가세 포함" : "과세 · 부가세 별도"}</span></> },
    { key: "quantity", label: "수량", width: 95, align: "right", value: qty, total: true,
      editor: { type: "number", ariaLabel: line => `${line.name} 수량`, min: 0, max: 100000, onChange: onQuantity, disabled: () => busy } },
    { key: "lineTotal", label: "합계", width: 112, align: "right", total: true, totalFormat: won,
      value: line => pricesVisible && line.unitPrice !== null ? Math.round(line.unitPrice * qty(line)) : null,
      render: line => !pricesVisible || !qty(line) ? "—" : line.isMarketPrice ? "배송 때 확정" : line.unitPrice === null ? "—" : won(Math.round(line.unitPrice * qty(line))) },
    ...(!catalogMode ? [{
      key: "hide", label: "항목 설정", width: 90, sortable: false, value: () => null,
      render: (line: Product) => <button className="min-h-8 text-xs underline" disabled={busy} onClick={() => void onPreference(line.productId, "isHidden")} type="button">{preferences.get(line.productId)?.isHidden ? "다시 표시" : "품목 숨기기"}</button>,
    }] : []),
  ];
  return <CommonDataTable columns={columns} rows={rows} rowKey={line => line.key} settingsKey={settingsKey}
    selectable={false} numbered={false} totalNote={pricesVisible && marketCount ? `표 합계에서 시가 ${marketCount}줄 제외` : undefined} />;
}
