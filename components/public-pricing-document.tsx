"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicDocumentOutput } from "@/domains/pricing/document-share";
import { koreaDay } from "@/domains/pricing/document";
import { PricingDocPaper } from "./pricing-doc-paper";
import { SharedPricingAcceptance } from "./shared-pricing-acceptance";
import { Button } from "./ui/button";
import { SearchInput } from "./ui/search-input";
import { BottomActionBar, MobileListRow, MoneyText } from "./ui/mobile";
import { EmptyState } from "./ui/state";

type OrderEntry = { available: boolean; companyName: string; title: string; version: number; message?: string; member?: boolean };

export function PublicPricingDocument({ embedded }: { embedded?: { token: string; orderHref: string } }) {
  const [document, setDocument] = useState<PublicDocumentOutput | null>(null);
  const [message, setMessage] = useState("문서를 확인하고 있습니다.");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptance, setAcceptance] = useState<{ token: string; available: boolean } | null>(null);
  const [orderEntry, setOrderEntry] = useState<OrderEntry | null>(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [query, setQuery] = useState("");
  const sequence = useRef(0);
  const continuedOrder = useRef(false);
  const embeddedToken = embedded?.token;
  const member = Boolean(embedded || orderEntry?.member);
  const startOrder = useCallback(async () => {
    if (member || !acceptance || !orderEntry?.available || orderBusy) return;
    const current = sequence.current, token = acceptance.token;
    setOrderBusy(true); setOrderMessage("");
    try {
      const response = await fetch("/api/pricing-documents/order-intent", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { intent?: string; message?: string; next?: string; storeUrl?: string };
      if (!response.ok) throw new Error(result.message || "가입 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (result.next === "order") {
        if (typeof result.storeUrl !== "string" || !/^\/store\?products=all#[0-9a-f-]{36}\.[0-9a-f]{32}\.[0-9a-f]{64}$/.test(result.storeUrl))
          throw new Error("주문 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
        if (sequence.current === current && window.location.hash.slice(1) === token) window.location.assign(result.storeUrl);
        return;
      }
      if (typeof result.intent !== "string" || result.intent.length > 1500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.intent))
        throw new Error("가입 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (sequence.current === current && window.location.hash.slice(1) === token)
        window.location.assign(`/store/activate#${result.intent}`);
    } catch (error) {
      if (sequence.current === current) setOrderMessage(error instanceof Error ? error.message : "가입 연결을 확인하지 못했습니다. 다시 시도해 주세요.");
    } finally { setOrderBusy(false); }
  }, [acceptance, member, orderEntry, orderBusy]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setDocument(null); setAcceptance(null); setOrderEntry(null); setOrderMessage(""); setQuery(""); setBusy(true); setMessage("문서를 확인하고 있습니다.");
    try {
      const token = embeddedToken ?? window.location.hash.slice(1);
      if (!token || token.length > 200) throw new Error("공유 링크를 확인해 주세요. 담당자에게 새 링크를 요청해 주세요.");
      const response = await fetch("/api/pricing-documents/public", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { document?: PublicDocumentOutput; expiresAt?: string; message?: string; acceptanceAvailable?: boolean; orderEntry?: OrderEntry };
      if (!response.ok || !result.document) throw new Error(result.message || "문서를 확인하지 못했습니다. 다시 시도해 주세요.");
      if (!result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error("링크 유효기간을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (sequence.current === current) { setDocument(result.document); setExpiresAt(result.expiresAt); setAcceptance({ token, available: result.acceptanceAvailable === true }); setOrderEntry(result.orderEntry ?? null); setMessage(""); }
    } catch (error) { if (sequence.current === current) setMessage(error instanceof Error ? error.message : "문서를 확인하지 못했습니다."); }
    finally { if (sequence.current === current) setBusy(false); }
  }, [embeddedToken]);
  useEffect(() => {
    void load();
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    window.addEventListener("hashchange", load); window.addEventListener("pageshow", restore);
    return () => { ++sequence.current; window.removeEventListener("hashchange", load); window.removeEventListener("pageshow", restore); };
  }, [load]);
  useEffect(() => {
    if (member || !acceptance || !orderEntry?.available || continuedOrder.current || new URLSearchParams(window.location.search).get("continueOrder") !== "1") return;
    continuedOrder.current = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    void startOrder();
  }, [acceptance, member, orderEntry, startOrder]);
  useEffect(() => {
    if (!document) return;
    const hardCutoff = Date.parse(expiresAt), priceCutoff = document.expired ? Infinity : Date.parse(`${document.validUntil}T15:00:00Z`);
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      if (Date.now() >= hardCutoff) {
        ++sequence.current; setDocument(null); setAcceptance(null); setOrderEntry(null);
        setMessage("링크 열람기간이 끝났습니다. 발행 회사에 새 링크를 요청해 주세요.");
      } else if (Date.now() >= priceCutoff) {
        ++sequence.current;
        setDocument(previous => previous ? { ...previous, expired: true, lines: previous.lines.map(line => ({ ...line, price: null })) } : null);
        setAcceptance(previous => previous ? { ...previous, available: false } : null);
        setOrderEntry(previous => previous ? { ...previous, available: false } : null); setOrderMessage("");
        setMessage("가격·주문 유효기간이 지났습니다. 새 단가표는 발행 회사에 요청해 주세요.");
      } else timer = window.setTimeout(check, Math.min(2147483647, Math.min(hardCutoff, priceCutoff) - Date.now()));
    };
    const visible = () => { if (window.document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check); window.document.addEventListener("visibilitychange", visible);
    check();
    return () => {
      window.clearTimeout(timer); window.removeEventListener("focus", check);
      window.document.removeEventListener("visibilitychange", visible);
    };
  }, [document, expiresAt]);
  const safeDocument = document && koreaDay() > document.validUntil ? { ...document, expired: true, lines: document.lines.map(l => ({ ...l, price: null })) } : document;
  const Container = embedded ? "section" : "main";
  const orderHref = embedded?.orderHref ?? "/store?view=order";
  const showOrder = Boolean(safeDocument && (orderEntry || member));
  const orderDisabled = Boolean(safeDocument?.expired || (!member && !orderEntry?.available));
  const orderLabel = safeDocument?.expired ? "주문 기간 종료"
    : member ? "이 단가표로 주문하기" : orderEntry?.available ? "이 단가로 주문 시작" : "주문 연결 준비 중";
  const keyword = query.trim().toLocaleLowerCase("ko-KR");
  const lines = safeDocument?.lines.filter(line => !keyword ||
    [line.displayName, line.brand, line.spec, line.unit].some(value => value.toLocaleLowerCase("ko-KR").includes(keyword))) ?? [];
  const filtered = Boolean(safeDocument && lines.length !== safeDocument.lines.length);
  const end = safeDocument && /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeDocument.validUntil);
  const until = end ? `${Number(end[2])}월 ${Number(end[3])}일까지` : "";
  const companyColor = safeDocument?.theme === "blue" ? "text-blue-700" : safeDocument?.theme === "green" ? "text-emerald-700" : "text-slate-800";
  return <Container className={`mx-auto max-w-[900px] space-y-4 p-4 ${showOrder && !embedded ? "max-md:pb-28" : ""}`}>
    {embedded && <h1 className="text-lg font-semibold">공유 문서</h1>}
    {message && <p role="status">{message}</p>}
    {!safeDocument && !busy && message && <Button variant="outline" className="min-h-[44px]" onClick={() => void load()}>다시 확인</Button>}
    {safeDocument && (embedded ? <PricingDocPaper output={safeDocument} /> : <>
      <header className="space-y-1 md:hidden print:hidden">
        <p className={`text-[15px] font-bold ${companyColor}`}>{safeDocument.companyName}</p>
        <h1 className="break-keep text-xl font-bold">{safeDocument.title}</h1>
        <p className="text-[15px] text-slate-600">{until} · {safeDocument.display.priceIncludesTax ? "부가세 포함" : "부가세 별도"} <span className="text-xs">v{safeDocument.version}</span></p>
        {safeDocument.expired && <p className="text-[15px] text-slate-600">유효기간이 지나 가격을 표시하지 않습니다.</p>}
      </header>
      {safeDocument.lines.length > 15 && <div className="print:hidden">
        <SearchInput aria-label="문서 품목 검색" className="w-full min-h-11" placeholder="품목명·규격 검색" value={query} onChange={setQuery} />
      </div>}
      <div className={filtered ? "hidden print:block" : "hidden md:block print:block"}>
        <PricingDocPaper output={safeDocument} />
      </div>
      {filtered && <div className="hidden md:block print:hidden">
        {lines.length ? <PricingDocPaper output={{ ...safeDocument, lines }} /> : <EmptyState bare message="검색에 맞는 품목이 없습니다." />}
      </div>}
      <section aria-label="문서 품목" className="overflow-hidden rounded-lg border bg-white md:hidden print:hidden">
        {lines.length ? <ul>{lines.map((line, index) => (
          <li key={index}>
            <MobileListRow title={line.displayName} subtitle={<>
              <span>{[line.spec, line.unit].filter(Boolean).join(" · ")}</span>
              <span className="block whitespace-normal">{[
                line.brand,
                safeDocument.display.showTaxType ? (line.taxType === "exempt" ? "면세" : "과세") : "",
                line.badge,
                line.badge && line.endsOn ? `${line.endsOn}까지` : "",
                line.badge && line.remaining != null ? `남은 ${line.remaining}` : "",
              ].filter(Boolean).join(" · ")}</span>
            </>} trailing={line.price === null ? undefined : <MoneyText value={line.price} />} />
          </li>
        ))}</ul> : <EmptyState bare className="p-4" message={keyword ? "검색에 맞는 품목이 없습니다." : "표시 가능한 품목이 없습니다."} />}
      </section>
    </>)}
    {showOrder && <section aria-label="공개 문서 주문 안내" className="space-y-2 text-[15px] text-slate-700 print:hidden">
      <p>가격·주문 {until}</p>
      {member ? <p>주문 메뉴에서 발급된 주문 가능 문서를 확인해 주세요.</p>
        : safeDocument?.expired ? <p>새 단가표는 발행 회사에 요청해 주세요.</p>
        : !orderEntry?.available ? <p>{orderEntry?.message || "주문 연결을 준비 중입니다. 발행 회사에 문의해 주세요."}</p>
        : <p>카카오로 로그인한 뒤 주문을 시작할 수 있습니다.</p>}
      {orderMessage && <p role="status">{orderMessage}</p>}
      {member ? !orderDisabled && <Link className={`maju-button-primary inline-flex min-h-[48px] items-center justify-center ${embedded ? "" : "max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:z-30"}`} href={orderHref}>{orderLabel}</Link> : <>
        <Button className="hidden min-h-[48px] md:inline-flex" disabled={orderDisabled || orderBusy} type="button" onClick={() => void startOrder()}>{orderBusy ? "확인 중…" : orderLabel}</Button>
        <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
          <BottomActionBar busy={orderBusy} disabled={orderDisabled} onClick={() => void startOrder()}>{orderLabel}</BottomActionBar>
        </div>
      </>}
    </section>}
    {safeDocument && !safeDocument.expired && acceptance?.available && !embedded && <SharedPricingAcceptance key={`${acceptance.token}:${expiresAt}`} token={acceptance.token} kind={safeDocument.kind} />}
    {safeDocument && <p className="text-xs text-slate-500 print:hidden">문서를 여는 것만으로는 수락이나 주문이 접수되지 않습니다.</p>}
  </Container>;
}
