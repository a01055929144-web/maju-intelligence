"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicDocumentOutput } from "@/domains/pricing/document-share";
import { koreaDay } from "@/domains/pricing/document";
import { PricingDocPaper } from "./pricing-doc-paper";

export function PublicPricingDocument() {
  const [document, setDocument] = useState<PublicDocumentOutput | null>(null);
  const [message, setMessage] = useState("문서를 확인하고 있습니다.");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setDocument(null); setBusy(true); setMessage("문서를 확인하고 있습니다.");
    try {
      const token = window.location.hash.slice(1);
      if (!token || token.length > 200) throw new Error("공유 링크를 확인해 주세요. 담당자에게 새 링크를 요청해 주세요.");
      const response = await fetch("/api/pricing-documents/public", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { document?: PublicDocumentOutput; expiresAt?: string; message?: string };
      if (!response.ok || !result.document) throw new Error(result.message || "문서를 확인하지 못했습니다. 다시 시도해 주세요.");
      if (!result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error("링크 유효기간을 확인하지 못했습니다. 다시 시도해 주세요.");
      if (sequence.current === current) { setDocument(result.document); setExpiresAt(result.expiresAt); setMessage(""); }
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
    if (!document) return;
    const cutoff = Math.min(Date.parse(expiresAt), document.expired ? Infinity : Date.parse(`${document.validUntil}T15:00:00Z`));
    let timer: number;
    const check = () => {
      if (Date.now() >= cutoff) { setDocument(null); setMessage("유효기간을 다시 확인해 주세요. 담당자에게 새 링크를 요청할 수 있습니다."); }
      else timer = window.setTimeout(check, Math.min(2147483647, cutoff - Date.now()));
    };
    check();
    return () => window.clearTimeout(timer);
  }, [document, expiresAt]);
  const safeDocument = document && koreaDay() > document.validUntil ? { ...document, expired: true, lines: document.lines.map(l => ({ ...l, price: null })) } : document;
  return <main className="mx-auto max-w-[900px] space-y-4 p-4">
    <h1 className="text-lg font-semibold">공유 문서</h1>
    <p className="text-sm text-slate-600">열람 전용입니다. 링크 열람은 수락이나 주문 신청이 아닙니다.</p>
    {message && <p role="status">{message}</p>}
    <button disabled={busy} className="min-h-[44px] rounded border px-3" onClick={() => void load()}>{busy ? "확인 중" : "다시 확인"}</button>
    {safeDocument && <PricingDocPaper output={safeDocument} />}
  </main>;
}
