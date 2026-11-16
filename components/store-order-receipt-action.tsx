"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export function StoreOrderReceiptAction({ companyId, storeAccountId, orderId, documentId, revision }: { companyId: string; storeAccountId: string; orderId: string; documentId: string; revision: number }) {
  const router = useRouter();
  const [disputing, setDisputing] = useState(false);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(status: "confirmed" | "disputed") {
    if (busy || (status === "disputed" && !memo.trim())) return;
    setBusy(true); setMessage("");
    const response = await fetchWithTimeout("/api/store/order-receipts", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, storeAccountId, orderId, documentId, revision, status, memo }) }, 15000).catch(() => null);
    const payload = await response?.json().catch(() => null) as { message?: string } | null;
    setBusy(false);
    if (!response?.ok) { setMessage(payload?.message || "수령 확인을 저장하지 못했습니다."); return; }
    router.refresh();
  }
  return <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
    <div className="grid grid-cols-2 gap-2">
      <button className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void submit("confirmed")} type="button">이상 없음 확인</button>
      <button className="min-h-11 rounded-lg border bg-white px-3 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => setDisputing(value => !value)} type="button">이상 있음</button>
    </div>
    {disputing ? <div className="space-y-2"><textarea aria-label="이상 내용" className="min-h-24 w-full rounded-lg border p-3 text-sm" maxLength={500} onChange={event => setMemo(event.target.value)} placeholder="빠진 품목·수량과 내용을 적어 주세요." value={memo} /><button className="min-h-11 w-full rounded-lg border border-rose-300 bg-white px-3 text-sm font-bold text-rose-700 disabled:opacity-50" disabled={busy || !memo.trim()} onClick={() => void submit("disputed")} type="button">이상 내용 보내기</button></div> : null}
    {message ? <p aria-live="polite" className="text-sm font-semibold text-rose-700">{message}</p> : null}
  </div>;
}
