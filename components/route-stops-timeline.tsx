"use client";

import { useEffect, useState } from "react";
import { groupStopsByDriver, stopClock, STOP_STATUS_LABEL, type RouteStopRecord } from "@/domains/delivery/stop-timeline";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// CC-67: 그 날짜의 정류장(delivery_route_stops) 기준 순서 · 상태 · 시각 · 사진 · 이유. 정류장이 없는 날은 아무것도 그리지 않아 화면이 지금 방식 그대로다.
export function RouteStopsTimeline({ date }: { readonly date: string }) {
  const [stops, setStops] = useState<RouteStopRecord[]>([]);
  useEffect(() => {
    let alive = true;
    setStops([]);
    void fetchWithTimeout(`/api/route-stops?date=${encodeURIComponent(date)}`, { cache: "no-store" }, 10000)
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { stops?: RouteStopRecord[] } | null) => { if (alive && json?.stops?.length) setStops(json.stops); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [date]);
  if (!stops.length) return null;
  return (
    <section aria-label="정류장 기준 배송 기록" className="maju-section-card p-3">
      <h3 className="text-sm font-black text-slate-950">정류장 기준 · {date}</h3>
      {groupStopsByDriver(stops).map((group) => (
        <div className="mt-2" key={group.driverName}>
          <p className="text-xs font-black text-slate-600">{group.driverName}</p>
          <ol className="mt-1 space-y-1">
            {group.stops.map((stop) => {
              const arrived = stopClock(stop.arrivedAt), done = stopClock(stop.completedAt);
              return (
                <li className={`rounded-md border px-2 py-1.5 text-xs ${stop.dashed ? "border-dashed border-sky-400 bg-sky-50/50" : "border-slate-200 bg-white"}`} key={stop.id}>
                  <span className="font-black text-slate-900">{stop.order}. {stop.name}</span>
                  {stop.dashed ? <span className="ml-1 rounded bg-sky-100 px-1 font-bold text-sky-800">영업 · 단가표</span> : null}
                  <span className="ml-2 font-bold text-slate-600">{STOP_STATUS_LABEL[stop.status]}</span>
                  {arrived || done ? <span className="ml-2 text-slate-500">{arrived ? `도착 ${arrived}` : ""}{arrived && done ? " · " : ""}{done ? `완료 ${done}` : ""}</span> : null}
                  {stop.photoCount ? <span className="ml-2 text-slate-500">사진 {stop.photoCount}장</span> : null}
                  {stop.reasonLabel ? <span className="ml-2 font-bold text-amber-700">{stop.reasonLabel}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
