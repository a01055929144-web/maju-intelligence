"use client";

import { useEffect, useRef, useState } from "react";
import { SlideToConfirm } from "@/components/ui/mobile";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type Stop = { id: string; leadId: string; order: number; status: string; name: string; address: string };
const reasons = [["closed", "문이 닫혀 있음"], ["moved_or_closed", "폐업·이전함"], ["refused", "받지 않음"], ["no_time", "시간이 없어 못 들름"]] as const;

export function MobileDriverSalesStops({ enabled, undoEnabled = false }: { enabled: boolean; undoEnabled?: boolean }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [handed, setHanded] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{ completedAt: string; stop: Stop } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void fetchWithTimeout("/api/mobile/driver-sales-stops", { cache: "no-store" }, 12000)
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => setStops(payload?.stops || []))
      .catch(() => setMessage("가는 길 영업을 불러오지 못했습니다."));
  }, [enabled]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  if (!enabled || (!stops.length && !undo && !message)) return null;
  async function finish(stop: Stop, outcome: "completed" | "closed" | "moved_or_closed" | "refused" | "no_time") {
    setBusy(stop.id); setMessage("");
    const response = await fetchWithTimeout("/api/mobile/driver-sales-stops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopId: stop.id, outcome, handedToOwner: handed[stop.id] === true }) }, 15000).catch(() => null);
    setBusy("");
    if (!response?.ok) { setMessage("저장하지 못했습니다. 연결을 확인하고 다시 밀어주세요."); return; }
    const payload = await response.json().catch(() => null) as { completedAt?: string } | null;
    setStops((current) => current.filter((item) => item.id !== stop.id));
    setMessage(outcome === "completed" ? "견적 전달로 기록했습니다." : "전달 못 함 사유를 기록했습니다.");
    if (undoEnabled && payload?.completedAt) {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo({ completedAt: payload.completedAt, stop });
      undoTimer.current = setTimeout(() => setUndo(null), 5_001);
    }
  }

  async function undoLast() {
    if (!undo) return;
    const response = await fetchWithTimeout("/api/mobile/driver-route-actions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stopId: undo.stop.id, completedAt: undo.completedAt }) }, 8000).catch(() => null);
    if (!response?.ok) { setUndo(null); setMessage("5초가 지나 되돌릴 수 없습니다."); return; }
    setStops((current) => [...current, undo.stop].sort((a, b) => a.order - b.order));
    setUndo(null); setMessage("방금 처리를 되돌렸습니다.");
  }

  return <section aria-label="가는 길 영업" className="space-y-3">
    {stops.map((stop) => <article className="rounded-2xl border border-dashed border-blue-400 bg-blue-50 p-3" key={stop.id}>
      <p className="text-xs font-black text-blue-700">영업 매장 · 단가표 · 순서 {stop.order}</p>
      <p className="mt-1 text-base font-black text-slate-950">{stop.name}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{stop.address}</p>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold"><input checked={handed[stop.id] === true} onChange={(event) => setHanded((current) => ({ ...current, [stop.id]: event.target.checked }))} type="checkbox" />사장님께 직접 드림</label>
      <SlideToConfirm busy={busy === stop.id} label="밀어서 단가표 완료" onConfirm={() => void finish(stop, "completed")} />
      <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-slate-600">전달 못 함</summary><div className="grid grid-cols-2 gap-2">{reasons.map(([value, label]) => <button className="min-h-11 rounded-lg border bg-white px-2 text-xs font-bold" disabled={Boolean(busy)} key={value} onClick={() => void finish(stop, value)} type="button">{label}</button>)}</div></details>
    </article>)}
    {undo ? <div aria-live="assertive" className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"><span>저장했습니다 · 5초 안에 되돌릴 수 있어요.</span><button className="min-h-10 rounded-lg bg-white px-3 text-slate-950" onClick={() => void undoLast()} type="button">되돌리기</button></div> : null}
    {message ? <p aria-live="polite" className="text-xs font-bold text-teal-700">{message}</p> : null}
  </section>;
}
