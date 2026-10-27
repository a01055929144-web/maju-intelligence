"use client";

import Link from "next/link";
import { CheckCircle2, GripVertical, Phone, Truck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type MobileRouteStop = { address?: string; distanceKm?: number; durationMinutes?: number; id: string; name: string; phone?: string; region: string };
type RouteStatusFilter = "all" | "pending" | "completed";

export function MobileRouteList({ completedCustomerIds = [], driverName, initialStops, routeArea, selectedStopId }: { completedCustomerIds?: string[]; driverName: string; initialStops: MobileRouteStop[]; routeArea: string; selectedStopId?: string }) {
  const [stops, setStops] = useState(initialStops);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RouteStatusFilter>("all");
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
  const selectedIndex = stops.findIndex((stop) => stop.id === selectedStopId);
  const nextPendingIndex = stops.findIndex((stop) => !completed.has(stop.id));
  const activeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, nextPendingIndex);
  const pendingCount = Math.max(0, stops.length - completedCount);
  const visibleStops = stops.filter((stop) => statusFilter === "all" || (statusFilter === "completed") === completed.has(stop.id));

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

  return <section className="mobile-card scroll-mt-24 rounded-2xl p-3 shadow-sm" id="route-list">
    <div className="flex items-center justify-between gap-3"><div><p className="mobile-accent text-xs font-semibold">오늘의 경로</p><p className="mt-1 text-lg font-bold">{stops.length ? `${completedCount} / ${stops.length}곳 완료` : "오늘 배송 없음"}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${pendingCount ? "mobile-accent-soft" : "bg-teal-500/15 text-teal-300"}`}>{pendingCount ? `${pendingCount}곳 대기` : stops.length ? "모두 완료" : "배정 0곳"}</span></div>
    <div className="mobile-card-raised mt-3 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${stops.length ? completedCount / stops.length * 100 : 0}%` }} /></div>
    {stops.length ? <p className="mobile-muted mt-2 text-xs font-semibold">{pendingCount ? `${activeIndex + 1}번째 매장 · 완료하면 다음 매장으로 자동 이동` : "모두 완료 · 매장을 누르면 기록 확인"}</p> : null}
    <div className="mt-3 flex items-start overflow-hidden pb-1">
      {stops.slice(Math.max(0, activeIndex - 1), activeIndex + 2).map((stop, visibleIndex, visibleStops) => {
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
            {visibleIndex < visibleStops.length - 1 ? <span className={`mt-5 h-0.5 w-3 shrink-0 ${index < activeIndex || done ? "bg-teal-500" : "bg-slate-600"}`} /> : null}
          </div>
        );
      })}
    </div>
    <button className="mobile-card-raised mt-2 flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold disabled:cursor-default disabled:opacity-60" disabled={!stops.length} onClick={() => setSheetOpen(true)} type="button"><span className="flex items-center gap-2"><Truck className="mobile-accent h-4 w-4" />{pendingCount ? "전체 코스 보기 · 순서 변경" : stops.length ? "완료 코스 보기" : "변경할 코스 없음"}</span><span className="mobile-accent">{stops.length}곳</span></button>
    {sheetOpen ? <div aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-slate-950/45" role="dialog" onClick={() => setSheetOpen(false)}><div className="mobile-card max-h-[86dvh] w-full rounded-t-3xl border shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" /><div className="border-b border-[var(--mobile-border)] px-4 py-3"><div className="flex items-center justify-between"><div><p className="font-black">오늘의 전체 경로</p><p className="mobile-muted text-xs font-bold">{driverName} · {routeArea} · 대기 매장은 길게 눌러 이동</p></div><button aria-label="닫기" className="mobile-card-raised grid h-10 w-10 place-items-center rounded-full border" onClick={() => setSheetOpen(false)} type="button"><X className="h-5 w-5" /></button></div><div aria-label="배송 상태 필터" className="mt-3 grid grid-cols-3 gap-2">{([['all', `전체 ${stops.length}`], ['pending', `대기 ${pendingCount}`], ['completed', `완료 ${completedCount}`]] as const).map(([value, label]) => <button aria-pressed={statusFilter === value} className={`min-h-9 rounded-full px-2 text-xs font-bold ${statusFilter === value ? "mobile-primary-action" : "mobile-secondary-action border"}`} key={value} onClick={() => setStatusFilter(value)} type="button">{label}</button>)}</div></div><div className="max-h-[calc(86dvh-132px)] divide-y divide-[var(--mobile-border)] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {visibleStops.map((stop) => { const index = stops.findIndex((item) => item.id === stop.id); const done = completed.has(stop.id); const active = stop.id === selectedStopId; const next = !done && index === nextPendingIndex; return <div className={`relative flex min-h-14 items-center gap-2 px-3 py-2 ${active ? "mobile-route-active-row" : ""} ${done ? "opacity-75" : ""}`} data-route-stop-id={stop.id} key={stop.id}><Link aria-label={`${stop.name} ${done ? "배송 기록 확인" : "처리하기"}`} className="absolute inset-0" href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`} onClick={() => setSheetOpen(false)} /><span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-teal-600 text-white" : active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span><div className="pointer-events-none relative z-10 min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className={`truncate text-sm font-black ${active ? "mobile-route-active-title" : ""}`}>{stop.name}</p><span className="mobile-muted truncate text-[11px]">{stop.address || stop.region}</span></div><div className="mt-1 flex items-center gap-1.5"><span className="mobile-muted text-[10px] font-bold">{stop.distanceKm || 0}km · {stop.durationMinutes || 0}분</span>{done ? <Badge className="bg-teal-100 text-teal-800">완료</Badge> : next ? <Badge className="bg-amber-100 text-amber-900">다음</Badge> : active ? <Badge className="bg-slate-900 text-white">선택</Badge> : <Badge className="bg-slate-100 text-slate-600">대기</Badge>}</div></div>{stop.phone ? <a aria-label={`${stop.name} 전화`} className="relative z-20 grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700" href={`tel:${stop.phone}`}><Phone className="h-4 w-4" /></a> : null}{!done ? <button aria-label={`${stop.name} 순서 이동`} className="relative z-20 grid h-10 w-10 touch-none place-items-center rounded-lg border text-slate-500" disabled={saving} onPointerCancel={cancelDrag} onPointerDown={(event) => beginDrag(stop.id, event)} onPointerMove={moveDrag} onPointerUp={endDrag} type="button"><GripVertical className="h-5 w-5" /></button> : null}</div>; })}
      {!visibleStops.length ? <div className="p-6 text-center"><p className="text-sm font-black">{stops.length ? "선택한 상태의 매장이 없습니다." : "오늘 배송할 매장이 없습니다."}</p><p className="mobile-muted mt-1 text-xs font-bold leading-5">{stops.length ? "다른 상태 칩을 누르면 바로 전환됩니다." : "새 배정이 생기면 이 목록에 표시됩니다."}</p></div> : null}
      {message ? <div aria-live="polite" className={`sticky bottom-0 bg-white px-4 py-3 text-xs font-bold shadow-[0_-4px_12px_rgba(15,23,42,.06)] ${saveError ? "text-rose-700" : "text-teal-700"}`}><p>{saving ? "순서를 저장 중입니다." : message}</p>{saveError ? <div className="mt-2 flex items-center gap-2"><button className="min-h-10 rounded-lg bg-rose-700 px-3 text-white disabled:opacity-50" disabled={saving || !failedStopsRef.current} onClick={() => { const failed = failedStopsRef.current; if (failed) void saveOrder(failed); }} type="button">저장 재시도</button><span className="leading-4 text-slate-500">또는 원하는 매장을 눌러 바로 처리하세요.</span></div> : null}</div> : null}
    </div></div></div> : null}
  </section>;
}
