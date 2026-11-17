"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicDocumentOutput } from "@/domains/pricing/document-share";
import { koreaDay } from "@/domains/pricing/document";
import { PublicDocumentPaperImages } from "./public-document-paper-images";
import { PricingDocPaper } from "./pricing-doc-paper";
import { SharedPricingAcceptance } from "./shared-pricing-acceptance";
import { Button } from "./ui/button";
import { SearchInput } from "./ui/search-input";
import { BottomActionBar, MobileListRow, MoneyText } from "./ui/mobile";
import { EmptyState } from "./ui/state";

type OrderEntry = { available: boolean; companyName: string; title: string; version: number; message?: string; member?: boolean; shopping?: boolean };

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
  const [view, setView] = useState<"table" | "image" | "catalog">("table");
  const sequence = useRef(0);
  const continuedOrder = useRef(false);
  const embeddedToken = embedded?.token;
  const member = Boolean(embedded || orderEntry?.member);
  const shopping = !embedded && orderEntry?.shopping === true;
  const startOrder = useCallback(async () => {
    if ((!shopping && member) || !acceptance || !orderEntry?.available || orderBusy) return;
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
  }, [acceptance, member, orderEntry, orderBusy, shopping]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setDocument(null); setAcceptance(null); setOrderEntry(null); setOrderMessage(""); setQuery(""); setView("table"); setBusy(true); setMessage("문서를 확인하고 있습니다.");
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
    : shopping && orderEntry?.available ? (member ? "주문 화면 열기" : "카카오로 시작")
    : member ? "이 단가표로 주문하기" : orderEntry?.available ? "이 단가로 주문 시작" : "주문 연결 준비 중";
  const tableVisible = !shopping || view === "table";
  const keyword = query.trim().toLocaleLowerCase("ko-KR");
  const lines = safeDocument?.lines.filter(line => !keyword ||
    [line.displayName, line.brand, line.spec, line.unit].some(value => value.toLocaleLowerCase("ko-KR").includes(keyword))) ?? [];
  const filtered = Boolean(safeDocument && lines.length !== safeDocument.lines.length);
  const desktopTable = safeDocument && shopping && safeDocument.layout !== "table"
    ? { ...safeDocument, layout: "table" as const } : safeDocument;
  const separateScreenTable = desktopTable !== safeDocument || filtered;
  const end = safeDocument && /^(\d{4})-(\d{2})-(\d{2})$/.exec(safeDocument.validUntil);
  const until = end ? `${Number(end[2])}월 ${Number(end[3])}일까지` : "";
  const companyColor = safeDocument?.theme === "blue" ? "text-blue-700" : safeDocument?.theme === "green" ? "text-emerald-700" : "text-slate-800";
  return <Container className={`mx-auto max-w-[900px] space-y-4 p-4 ${showOrder && !embedded ? (shopping ? "pb-32 print:pb-4" : "max-md:pb-28") : ""}`}>
    {embedded && <h1 className="text-lg font-semibold">공유 문서</h1>}
    {message && <p role="status">{message}</p>}
    {!safeDocument && !busy && message && <Button variant="outline" className="min-h-[44px]" onClick={() => void load()}>다시 확인</Button>}
    {safeDocument?.expired && shopping && <section aria-label="기간 지난 단가표" className="space-y-2 rounded border bg-white p-4 print:hidden">
      <h2 className="font-bold">새 단가표를 받으세요</h2>
      <p>기간이 지나 이 단가표로는 주문할 수 없습니다. 발행 회사 담당자에게 새 단가표를 요청해 주세요.</p>
      {member && <Link className="maju-button-primary inline-flex min-h-[44px] items-center" href="/store?view=home">받은 단가표로 돌아가기</Link>}
    </section>}
    {safeDocument && shopping && <nav aria-label="공개 문서 보기" className="flex flex-wrap gap-2 print:hidden">
      {([["table", `단가표 품목 ${safeDocument.lines.length}`], ["catalog", member ? "전체 상품" : "전체 상품 · 가입 후"], ["image", "문서 이미지"]] as const).map(([id, label]) =>
        <Button key={id} type="button" variant={view === id ? "default" : "outline"} aria-pressed={view === id}
          className="min-h-[44px]" onClick={() => setView(id)}>{label}</Button>)}
    </nav>}
    {safeDocument && shopping && view === "image" && <div className="print:hidden"><PublicDocumentPaperImages document={safeDocument} /></div>}
    {safeDocument && shopping && view === "catalog" && <section aria-label="전체 상품" className="space-y-4 rounded border bg-white p-4 print:hidden">
      <h2 className="text-base font-bold">전체 상품</h2>
      <p>{member ? "주문 화면에서 연결된 유통사의 상품과 내 단가를 확인할 수 있습니다." : "가입하면 이 유통사의 전체 상품을 볼 수 있습니다."}</p>
      {!member && <div className="grid gap-3 blur-sm" aria-hidden="true">
        {[0, 1, 2].map(row => <div key={row} className="flex justify-between gap-4 border-b pb-3">
          <span className="h-4 w-32 rounded bg-slate-300" /><span className="h-4 w-16 rounded bg-slate-300" />
        </div>)}
      </div>}
    </section>}
    {safeDocument && (embedded ? <PricingDocPaper output={safeDocument} /> : <div className={tableVisible ? "space-y-4" : "hidden print:block"}>
      <header className="space-y-1 md:hidden print:hidden">
        <p className={`text-[15px] font-bold ${companyColor}`}>{safeDocument.companyName}</p>
        <h1 className="break-keep text-xl font-bold">{safeDocument.title}</h1>
        <p className="text-[15px] text-slate-600">{until} · {safeDocument.display.priceIncludesTax ? "부가세 포함" : "부가세 별도"} <span className="text-xs">v{safeDocument.version}</span></p>
        {safeDocument.expired && <p className="text-[15px] text-slate-600">유효기간이 지나 가격을 표시하지 않습니다.</p>}
      </header>
      {(shopping || safeDocument.lines.length > 15) && <div className="print:hidden">
        <SearchInput aria-label="문서 품목 검색" className="w-full min-h-11" placeholder="품목명·규격 검색" value={query} onChange={setQuery} />
      </div>}
      <div className={separateScreenTable ? "hidden print:block" : "hidden md:block print:block"}>
        <PricingDocPaper output={safeDocument} />
      </div>
      {separateScreenTable && desktopTable && <div className="hidden md:block print:hidden">
        {lines.length ? <PricingDocPaper output={{ ...desktopTable, lines }} /> : <EmptyState bare message="검색에 맞는 품목이 없습니다." />}
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
    </div>)}
    {showOrder && <section aria-label="공개 문서 주문 안내" className="space-y-2 text-[15px] text-slate-700 print:hidden">
      <p>가격·주문 {until}</p>
      {shopping && !orderDisabled && orderEntry?.available && !member ? <p>카카오로 시작하면 거래 약관과 개인정보 처리에 동의합니다.</p> : member ? <p>주문 메뉴에서 발급된 주문 가능 문서를 확인해 주세요.</p>
        : safeDocument?.expired ? <p>새 단가표는 발행 회사에 요청해 주세요.</p>
        : !orderEntry?.available ? <p>{orderEntry?.message || "주문 연결을 준비 중입니다. 발행 회사에 문의해 주세요."}</p>
        : <p>카카오로 로그인한 뒤 주문을 시작할 수 있습니다.</p>}
      {orderMessage && <p role="status">{orderMessage}</p>}
      {member && !shopping ? !orderDisabled && <Link className={`maju-button-primary inline-flex min-h-[48px] items-center justify-center ${embedded ? "" : "max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:z-30"}`} href={orderHref}>{orderLabel}</Link> : <>
        <Button className={shopping ? "hidden md:fixed md:bottom-4 md:right-8 md:z-30 md:inline-flex min-h-[48px]" : "hidden min-h-[48px] md:inline-flex"} disabled={orderDisabled || !orderEntry?.available || orderBusy} type="button" onClick={() => void startOrder()}>{orderBusy ? "확인 중…" : orderLabel}</Button>
        <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
          <BottomActionBar busy={orderBusy} disabled={orderDisabled || !orderEntry?.available} onClick={() => void startOrder()}>{orderLabel}</BottomActionBar>
        </div>
      </>}
    </section>}
    {safeDocument && !safeDocument.expired && acceptance?.available && !embedded && <SharedPricingAcceptance key={`${acceptance.token}:${expiresAt}`} token={acceptance.token} kind={safeDocument.kind} />}
    {safeDocument && <p className="text-xs text-slate-500 print:hidden">문서를 여는 것만으로는 수락이나 주문이 접수되지 않습니다.</p>}
  </Container>;
}
