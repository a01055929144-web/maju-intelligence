"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type Completion = { completedAt: string; customerIds: string[]; stopIds: string[] };

export function MobileRouteBulkComplete({ customerIds, onComplete, onUndo }: { customerIds: string[]; onComplete: (ids: string[]) => void; onUndo: (ids: string[]) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<Completion | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!customerIds.length && !undo && !message) return null;

  async function completeAll() {
    setBusy(true);
    setMessage("");
    const response = await fetchWithTimeout("/api/mobile/driver-route-actions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerIds }) }, 15000).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as (Completion & { message?: string }) | null : null;
    setBusy(false);
    setConfirming(false);
    if (!response?.ok || !payload) return setMessage(payload?.message || "일괄 완료를 저장하지 못했습니다. 다시 시도해 주세요.");
    onComplete(payload.customerIds);
    setUndo(payload);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5_001);
  }

  async function undoAll() {
    if (!undo) return;
    setBusy(true);
    const response = await fetchWithTimeout("/api/mobile/driver-route-actions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completedAt: undo.completedAt, stopIds: undo.stopIds }) }, 8000).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as { failedStopIds?: string[]; message?: string; undoneStopIds?: string[] } | null : null;
    setBusy(false);
    const undoneStopIds = payload?.undoneStopIds || [];
    const undoneCustomerIds = undo.customerIds.filter((_, index) => undoneStopIds.includes(undo.stopIds[index]));
    if (undoneCustomerIds.length) onUndo(undoneCustomerIds);
    setUndo(null);
    if (!response?.ok) return setMessage(payload?.message || "되돌리지 못했습니다. 배송 기록을 확인해 주세요.");
    setMessage("방금 일괄 완료를 되돌렸습니다.");
  }

  return <div className="mt-3">
    {customerIds.length ? <button className="min-h-11 w-full rounded-xl border border-teal-400/40 bg-teal-500/10 px-4 text-sm font-black text-teal-200 disabled:opacity-50" disabled={busy} onClick={() => setConfirming(true)} type="button">남은 {customerIds.length}곳 전체 완료</button> : null}
    {confirming ? <div aria-modal="true" className="fixed inset-0 z-[60] grid place-items-end bg-slate-950/60 p-3 sm:place-items-center" role="dialog"><div className="mobile-card w-full max-w-sm rounded-2xl border p-4 shadow-2xl"><h3 className="text-lg font-black">남은 정류장을 모두 완료할까요?</h3><p className="mobile-muted mt-2 text-sm font-semibold leading-6">배송 사진과 특이사항이 필요한 곳은 먼저 개별 처리하세요. 완료 뒤 5초 동안 되돌릴 수 있습니다.</p><div className="mt-4 grid grid-cols-2 gap-2"><button className="mobile-secondary-action min-h-11 rounded-xl border font-bold" disabled={busy} onClick={() => setConfirming(false)} type="button">취소</button><button className="mobile-primary-action min-h-11 rounded-xl font-black" disabled={busy} onClick={() => void completeAll()} type="button">{busy ? "저장 중" : `${customerIds.length}곳 완료`}</button></div></div></div> : null}
    {undo ? <div aria-live="assertive" className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"><span>{undo.customerIds.length}곳 완료 · 5초 안에 되돌릴 수 있어요.</span><button className="min-h-10 shrink-0 rounded-lg bg-white px-3 text-slate-950" disabled={busy} onClick={() => void undoAll()} type="button">되돌리기</button></div> : null}
    {message ? <p aria-live="polite" className="mt-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white">{message}</p> : null}
  </div>;
}
