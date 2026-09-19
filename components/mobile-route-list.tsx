"use client";

import Link from "next/link";
import { CheckCircle2, Clock, GripVertical, MapPinned, Phone, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type MobileRouteStop = {
  address?: string;
  distanceKm?: number;
  durationMinutes?: number;
  id: string;
  name: string;
  phone?: string;
  region: string;
};

export function MobileRouteList({ completedCustomerIds = [], driverName, initialStops, routeArea, selectedStopId }: {
  completedCustomerIds?: string[];
  driverName: string;
  initialStops: MobileRouteStop[];
  routeArea: string;
  selectedStopId?: string;
}) {
  const [stops, setStops] = useState(initialStops);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const stopsRef = useRef(initialStops);
  const lastSavedStopsRef = useRef(initialStops);
  const dragIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  function beginDrag(id: string, event: React.PointerEvent<HTMLButtonElement>) {
    const pointerId = event.pointerId;
    timerRef.current = setTimeout(() => {
      dragIdRef.current = id;
      event.currentTarget.setPointerCapture(pointerId);
      setMessage("잡은 매장을 원하는 위치로 이동하세요.");
    }, 250);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const draggedId = dragIdRef.current;
    if (!draggedId) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-route-stop-id]");
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

  async function endDrag() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dragIdRef.current) return;
    dragIdRef.current = null;
    const pendingStops = stopsRef.current;
    setSaving(true);
    setSaveError(false);
    try {
      const response = await fetchWithTimeout("/api/routes/confirm-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverName, customerIds: pendingStops.map((stop) => stop.id) })
      }, 15000);
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (response.ok) {
        lastSavedStopsRef.current = pendingStops;
        setMessage("변경한 방문 순서를 저장했습니다.");
      } else {
        stopsRef.current = lastSavedStopsRef.current;
        setStops(lastSavedStopsRef.current);
        setSaveError(true);
        setMessage(payload?.message || "순서 저장에 실패해 이전 순서로 되돌렸습니다.");
      }
    } catch {
      stopsRef.current = lastSavedStopsRef.current;
      setStops(lastSavedStopsRef.current);
      setSaveError(true);
      setMessage("네트워크 오류로 순서를 저장하지 못해 이전 순서로 되돌렸습니다.");
    } finally {
      setSaving(false);
    }
  }

  function cancelDrag() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dragIdRef.current) return;
    dragIdRef.current = null;
    stopsRef.current = lastSavedStopsRef.current;
    setStops(lastSavedStopsRef.current);
    setSaveError(false);
    setMessage("순서 변경을 취소했습니다.");
  }

  return (
    <section className="scroll-mt-24 rounded-xl border border-slate-200 bg-white" id="route-list">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <p className="truncate font-black text-slate-950">{driverName}</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-500">{routeArea} · 길게 눌러 순서 변경</p>
        </div>
        <Truck className="h-5 w-5 shrink-0 text-teal-700" />
      </div>
      <div className="divide-y divide-slate-100">
        {stops.map((stop, index) => {
          const completed = completedCustomerIds.includes(stop.id);
          return (
          <div className={`relative flex items-start gap-3 p-4 ${selectedStopId === stop.id ? "bg-teal-50/70" : ""}`} data-route-stop-id={stop.id} key={stop.id}>
            <Link aria-label={stop.name} className="absolute inset-0" href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`} />
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white ${selectedStopId === stop.id ? "bg-teal-700" : "bg-slate-900"}`}>{index + 1}</span>
            <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
              <div className="flex items-center gap-2">
                <p className="truncate font-black">{stop.name}</p>
                {completed ? <Badge className="shrink-0 bg-teal-100 text-teal-800"><CheckCircle2 className="mr-1 h-3 w-3" />완료</Badge> : <Badge className="shrink-0 bg-slate-100 text-slate-700">{stop.region}</Badge>}
              </div>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">{stop.address || "주소 확인 필요"}</p>
              <div className="mt-2 flex gap-1.5"><Small icon={MapPinned} label={`${stop.distanceKm}km`} /><Small icon={Clock} label={`${stop.durationMinutes}분`} /></div>
            </div>
            {stop.phone ? <a className="relative z-20 grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700" href={`tel:${stop.phone}`}><Phone className="h-4 w-4" /></a> : null}
            <button aria-label={`${stop.name} 순서 이동`} className="relative z-20 grid h-10 w-10 touch-none place-items-center rounded-lg border border-slate-200 text-slate-500" disabled={saving} onPointerCancel={cancelDrag} onPointerDown={(event) => beginDrag(stop.id, event)} onPointerMove={moveDrag} onPointerUp={endDrag} type="button"><GripVertical className="h-5 w-5" /></button>
          </div>
          );
        })}
        {!stops.length ? <div className="p-4 text-sm font-bold text-slate-500">오늘 배정된 코스가 없습니다.</div> : null}
      </div>
      {message ? <p aria-live="polite" className={`border-t border-slate-100 px-4 py-3 text-xs font-bold ${saveError ? "text-rose-700" : "text-teal-700"}`}>{saving ? "순서를 저장 중입니다." : message}</p> : null}
    </section>
  );
}

function Small({ icon: Icon, label }: { icon: typeof MapPinned; label: string }) {
  return <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600"><Icon className="h-3 w-3" />{label}</span>;
}
