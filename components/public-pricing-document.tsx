"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { documentLinkLastDay } from "@/domains/pricing/document-share";
import type { PublicDocumentOutput } from "@/domains/pricing/document-share";
import { koreaDay } from "@/domains/pricing/document";
import { PricingDocPaper } from "./pricing-doc-paper";
import { SharedPricingAcceptance } from "./shared-pricing-acceptance";
import { Button } from "./ui/button";

export function PublicPricingDocument() {
  const [document, setDocument] = useState<PublicDocumentOutput | null>(null);
  const [message, setMessage] = useState("문서를 확인하고 있습니다.");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptance, setAcceptance] = useState<{ token: string; available: boolean } | null>(null);
  const [orderEntry, setOrderEntry] = useState<{ available: boolean; companyName: string; title: string; version: number; message?: string } | null>(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const sequence = useRef(0);
  const continuedOrder = useRef(false);
  const startOrder = useCallback(async () => {
    if (!acceptance || !orderEntry?.available || orderBusy) return;
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
  }, [acceptance, orderEntry, orderBusy]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setDocument(null); setAcceptance(null); setOrderEntry(null); setOrderMessage(""); setBusy(true); setMessage("문서를 확인하고 있습니다.");
    try {
      const token = window.location.hash.slice(1);
      if (!token || token.length > 200) throw new Error("공유 링크를 확인해 주세요. 담당자에게 새 링크를 요청해 주세요.");
      const response = await fetch("/api/pricing-documents/public", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { document?: PublicDocumentOutput; expiresAt?: string; message?: string; acceptanceAvailable?: boolean; orderEntry?: { available: boolean; companyName: string; title: string; version: number; message?: string } };
      if (!response.ok || !result.document) throw new Error(result.message || "문서를 확인하지 못했습니다. 다시 시도해 주세요.");
      if (!result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error("링크 유효기간을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (sequence.current === current) { setDocument(result.document); setExpiresAt(result.expiresAt); setAcceptance({ token, available: result.acceptanceAvailable === true }); setOrderEntry(result.orderEntry ?? null); setMessage(""); }
    } catch (error) { if (sequence.current === current) setMessage(error instanceof Error ? error.message : "문서를 확인하지 못했습니다."); }
    finally { if (sequence.current === current) setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    window.addEventListener("hashchange", load); window.addEventListener("pageshow", restore);
    return () => { ++sequence.current; window.removeEventListener("hashchange", load); window.removeEventListener("pageshow", restore); };
  }, [load]);
  useEffect(() => {
    if (!acceptance || !orderEntry?.available || continuedOrder.current || new URLSearchParams(window.location.search).get("continueOrder") !== "1") return;
    continuedOrder.current = true;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    void startOrder();
  }, [acceptance, orderEntry, startOrder]);
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
        setMessage("가격·주문 유효기간이 지났습니다. 같은 QR로 품목을 계속 볼 수 있으며, 주문하려면 발행 회사에 새 문서를 요청해 주세요.");
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
  return <main className="mx-auto max-w-[900px] space-y-4 p-4">
    <h1 className="text-lg font-semibold">공유 문서</h1>
    <p className="text-sm text-slate-600">링크 열람은 수락이나 주문 신청이 아닙니다.</p>
    {message && <p role="status">{message}</p>}
    <button disabled={busy} className="min-h-[44px] rounded border px-3" onClick={() => void load()}>{busy ? "확인 중" : "다시 확인"}</button>
    {safeDocument && <PricingDocPaper output={safeDocument} />}
    {safeDocument && orderEntry && <section aria-label="공개 문서 주문 안내" className="space-y-2 rounded border p-3">
      <p className="text-sm">가격·주문: {safeDocument.validUntil}까지 · QR 품목 열람: {documentLinkLastDay(expiresAt)}까지</p>
      <p>{orderEntry.companyName} · {orderEntry.title} · 게시 버전 {orderEntry.version}</p>
      <p className="text-sm">문서는 로그인 없이 볼 수 있습니다. 카카오 인증 후 매장 정보·약관을 확인하고 발행 회사의 주문으로 연결합니다.</p>
      <Button className="min-h-[44px]" disabled={!orderEntry.available || safeDocument.expired || orderBusy} type="button" onClick={() => void startOrder()}>{orderBusy ? "가입 연결 확인 중" : safeDocument.expired ? "주문 기간 종료" : !orderEntry.available ? "주문 연결 준비 중" : "주문·점주 가입 시작"}</Button>
      {safeDocument.expired ? <p>유효기간을 확인한 뒤 발행 회사에 새 문서를 요청해 주세요.</p> : !orderEntry.available ? <p>{orderEntry.message || "카카오 점주 가입·주문 연결을 준비 중입니다. 발행 회사 담당자에게 문의해 주세요."}</p> : <p className="text-sm">발행 회사의 주문을 위해 점주 가입 화면으로 이동합니다. 아직 주문은 접수되지 않습니다.</p>}
      {orderMessage ? <p role="status">{orderMessage}</p> : null}
    </section>}
    {safeDocument && !safeDocument.expired && acceptance?.available && <SharedPricingAcceptance key={`${acceptance.token}:${expiresAt}`} token={acceptance.token} kind={safeDocument.kind} />}
  </main>;
}
