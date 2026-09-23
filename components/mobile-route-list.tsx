"use client";

import Link from "next/link";
import { CheckCircle2, Clock, GripVertical, MapPinned, Phone, Truck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type MobileRouteStop = { address?: string; distanceKm?: number; durationMinutes?: number; id: string; name: string; phone?: string; region: string };

export function MobileRouteList({ completedCustomerIds = [], driverName, initialStops, routeArea, selectedStopId }: { completedCustomerIds?: string[]; driverName: string; initialStops: MobileRouteStop[]; routeArea: string; selectedStopId?: string }) {
  const [stops, setStops] = useState(initialStops);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const stopsRef = useRef(initialStops);
  const lastSavedStopsRef = useRef(initialStops);
  const failedStopsRef = useRef<MobileRouteStop[] | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completed = new Set(completedCustomerIds);
  const completedCount = stops.filter((stop) => completed.has(stop.id)).length;
  const activeIndex = Math.max(0, stops.findIndex((stop) => stop.id === selectedStopId));

  useEffect(() => { stopsRef.current = stops; }, [stops]);
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [sheetOpen]);

  function beginDrag(id: string, event: React.PointerEvent<HTMLButtonElement>) {
    pointerIdRef.current = event.pointerId;
    startYRef.current = event.clientY;
    const target = event.currentTarget;
    timerRef.current = setTimeout(() => {
      dragIdRef.current = id;
      target.setPointerCapture(event.pointerId);
      setMessage("잡은 매장을 원하는 위치로 이동하세요.");
    }, 260);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    if (!dragIdRef.current && Math.abs(event.clientY - startYRef.current) >= 6) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    const draggedId = dragIdRef.current;
    if (!draggedId) return;
    event.preventDefault();
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-route-stop-id]"));
    const target = rows.find((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2) || rows.at(-1);
    const targetId = target?.dataset.routeStopId;
    if (!targetId || targetId === draggedId) return;
    setStops((current) => {
      const from = current.findIndex((stop) => stop.id === draggedId);
      const to = current.findIndex((stop) => stop.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      stopsRef.current = next;
      return next;
    });
  }

  function rollback(reason: string, failedStops?: MobileRouteStop[]) {
    failedStopsRef.current = failedStops || null;
    stopsRef.current = lastSavedStopsRef.current;
    setStops(lastSavedStopsRef.current);
    setSaveError(Boolean(failedStops));
    setMessage(reason);
  }

  async function saveOrder(pendingStops: MobileRouteStop[]) {
    setSaving(true);
    setSaveError(false);
    setMessage("순서를 저장 중입니다.");
    try {
      const response = await fetchWithTimeout("/api/routes/confirm-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverName, customerIds: pendingStops.map((stop) => stop.id) }) }, 15000);
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (response.ok) {
        failedStopsRef.current = null;
        lastSavedStopsRef.current = pendingStops;
        stopsRef.current = pendingStops;
        setStops(pendingStops);
        setMessage("변경한 방문 순서를 저장했습니다.");
      } else rollback(payload?.message || "순서 저장에 실패해 이전 순서로 되돌렸습니다.", pendingStops);
    } catch {
      rollback("네트워크 오류로 순서를 저장하지 못해 이전 순서로 되돌렸습니다.", pendingStops);
    } finally {
      setSaving(false);
    }
  }

  async function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pointerIdRef.current = null;
    if (!dragIdRef.current) return;
    dragIdRef.current = null;
    const pendingStops = stopsRef.current;
    await saveOrder(pendingStops);
  }

  function cancelDrag() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pointerIdRef.current = null;
    if (!dragIdRef.current) return;
    dragIdRef.current = null;
    rollback("순서 변경을 취소했습니다.");
  }

  return <section className="mobile-card scroll-mt-24 rounded-2xl p-4 shadow-sm" id="route-list">
    <div className="flex items-center justify-between gap-3"><div><p className="mobile-accent text-xs font-semibold">오늘의 경로</p><p className="mt-1 text-lg font-bold">{completedCount} / {stops.length}곳 완료</p></div><span className="mobile-accent-soft rounded-full px-3 py-1.5 text-xs font-semibold">진행 {Math.max(0, activeIndex + 1)}</span></div>
    <div className="mobile-card-raised mt-3 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${stops.length ? completedCount / stops.length * 100 : 0}%` }} /></div>
    <div className="mt-4 flex items-start overflow-hidden pb-2">
      {stops.slice(Math.max(0, activeIndex - 2), activeIndex + 3).map((stop, visibleIndex) => {
        const index = stops.findIndex((item) => item.id === stop.id);
        const done = completed.has(stop.id);
        const active = stop.id === selectedStopId;
        return (
          <div className="flex min-w-0 flex-1 items-start" key={stop.id}>
            <Link
              aria-current={active ? "step" : undefined}
              className="min-w-0 flex-1 rounded-lg px-0.5 py-1 text-center transition active:scale-95"
              href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`}
            >
              <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${done ? "bg-teal-600 text-white" : active ? "bg-slate-950 text-white ring-4 ring-teal-100" : "bg-slate-100 text-slate-500"}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <p className={`mt-1 truncate text-xs font-medium ${active ? "text-teal-300" : "text-slate-400"}`}>{stop.name}</p>
            </Link>
            {visibleIndex < Math.min(5, stops.length) - 1 ? <span className={`mt-5 h-0.5 w-3 shrink-0 ${index < activeIndex || done ? "bg-teal-500" : "bg-slate-600"}`} /> : null}
          </div>
        );
      })}
    </div>
    <button className="mobile-card-raised mt-2 flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold" onClick={() => setSheetOpen(true)} type="button"><span className="flex items-center gap-2"><Truck className="mobile-accent h-4 w-4" />전체 경로 · 순서 변경</span><span className="mobile-accent">{stops.length}곳</span></button>
    {sheetOpen ? <div aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-slate-950/70" role="dialog" onClick={() => setSheetOpen(false)}><div className="max-h-[86dvh] w-full rounded-t-3xl border border-slate-700 bg-[#111827] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-600" /><div className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><div><p className="font-black">오늘의 전체 경로</p><p className="text-xs font-bold text-slate-400">{driverName} · {routeArea} · 대기 매장은 길게 눌러 이동</p></div><button aria-label="닫기" className="grid h-10 w-10 place-items-center rounded-full bg-slate-800" onClick={() => setSheetOpen(false)} type="button"><X className="h-5 w-5" /></button></div><div className="max-h-[calc(86dvh-78px)] divide-y divide-slate-800 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {stops.map((stop, index) => { const done = completed.has(stop.id); const active = stop.id === selectedStopId; return <div className={`relative flex items-start gap-3 p-4 ${active ? "mobile-route-active-row" : ""}`} data-route-stop-id={stop.id} key={stop.id}><Link aria-label={`${stop.name} 처리하기`} className="absolute inset-0" href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`} onClick={() => setSheetOpen(false)} /><span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-teal-600 text-white" : active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span><div className="pointer-events-none relative z-10 min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`truncate font-black ${active ? "mobile-route-active-title" : ""}`}>{stop.name}</p>{done ? <Badge className="bg-teal-100 text-teal-800">완료</Badge> : active ? <Badge className="bg-slate-900 text-white">처리 중</Badge> : null}</div><p className="mt-1 truncate text-xs font-bold text-slate-500">{stop.address || stop.region}</p>{active ? <p className="mt-2 text-xs font-black text-teal-700">지금 처리 중</p> : <div className="mt-2 flex gap-1.5"><Small icon={MapPinned} label={`${stop.distanceKm}km`} /><Small icon={Clock} label={`${stop.durationMinutes}분`} /></div>}</div>{stop.phone ? <a aria-label={`${stop.name} 전화`} className="relative z-20 grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700" href={`tel:${stop.phone}`}><Phone className="h-4 w-4" /></a> : null}{!done ? <button aria-label={`${stop.name} 순서 이동`} className="relative z-20 grid h-10 w-10 touch-none place-items-center rounded-lg border text-slate-500" disabled={saving} onPointerCancel={cancelDrag} onPointerDown={(event) => beginDrag(stop.id, event)} onPointerMove={moveDrag} onPointerUp={endDrag} type="button"><GripVertical className="h-5 w-5" /></button> : null}</div>; })}
      {!stops.length ? <div className="p-6 text-center"><p className="text-sm font-black text-slate-300">오늘 배송할 매장이 없습니다.</p><p className="mt-1 text-xs font-bold leading-5 text-slate-500">오늘 배송 없음으로 제외된 매장은 다음 운영일에 다시 배정 후보로 표시됩니다.</p></div> : null}
      {message ? <div aria-live="polite" className={`sticky bottom-0 bg-white px-4 py-3 text-xs font-bold shadow-[0_-4px_12px_rgba(15,23,42,.06)] ${saveError ? "text-rose-700" : "text-teal-700"}`}><p>{saving ? "순서를 저장 중입니다." : message}</p>{saveError ? <div className="mt-2 flex items-center gap-2"><button className="min-h-10 rounded-lg bg-rose-700 px-3 text-white disabled:opacity-50" disabled={saving || !failedStopsRef.current} onClick={() => { const failed = failedStopsRef.current; if (failed) void saveOrder(failed); }} type="button">저장 재시도</button><span className="leading-4 text-slate-500">또는 원하는 매장을 눌러 바로 처리하세요.</span></div> : null}</div> : null}
    </div></div></div> : null}
  </section>;
}

function Small({ icon: Icon, label }: { icon: typeof MapPinned; label: string }) { return <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600"><Icon className="h-3 w-3" />{label}</span>; }
