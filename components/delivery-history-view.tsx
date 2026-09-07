"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { DeliveryCompletionEvent, DeliveryHistoryDay, DeliveryHistoryDriverGroup, StaffLocationEvent } from "@/lib/store";
import { formatMinutes, RouteMetric, StoreRow } from "@/components/sales-route-map-workspace";

// 2026-09-07 피드백("매일 배송 경로, 경유, 배송완료 여부 등 히스토리 파악 할 수 있도록 해야해,
// 달력으로 표기해서 기간 설정을 하고, 특정일자의 배송 일자를 보면 좋을 것 같아") 대응 화면입니다.
// 달력에서 월(기간)을 넘기며 날짜별 배송완료 건수를 배지로 보고, 특정 날짜를 클릭하면 그날
// 담당자별 방문 순서·완료 기록·실제 GPS 경로를 보여줍니다.

type DeliveryHistoryViewProps = {
  readonly companyId?: string;
  readonly onOpenStore: (storeId: string) => void;
  readonly stores: StoreRow[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
function toDateKey(year: number, month0: number, day: number) {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}
function todayKey() {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}
function formatDateKeyLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("ko-KR", { day: "numeric", month: "long", weekday: "short", year: "numeric" });
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 아래 위치/경로 요약 로직은 components/sales-route-map-workspace.tsx의 VehicleAnalysisModal이 쓰는
// 것과 동일한 판단 기준(GPS 오차 150m 초과·5분 이상 공백·시속 120km 초과 구간 제외)입니다. 그 파일의
// 내부(비-export) 헬퍼라 가져다 쓸 수 없어 이 화면에서 같은 로직을 그대로 다시 씁니다.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function isReliableLocationEvent(event: StaffLocationEvent) {
  return Number.isFinite(event.lat) && Number.isFinite(event.lng) && (!Number.isFinite(event.accuracyMeters) || Number(event.accuracyMeters) <= 150);
}
function createLocationRoutePath(events: StaffLocationEvent[]) {
  const path: Array<{ lat: number; lng: number }> = [];
  let previous: StaffLocationEvent | null = null;
  events.forEach((event) => {
    if (!isReliableLocationEvent(event)) {
      previous = null;
      path.push({ lat: Number.NaN, lng: Number.NaN });
      return;
    }
    if (previous) {
      const gapMinutes = (new Date(event.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 60000;
      const segmentKm = haversineKm(previous.lat, previous.lng, event.lat, event.lng);
      const speedKmh = gapMinutes > 0 ? (segmentKm / gapMinutes) * 60 : 0;
      if (gapMinutes > 5 || speedKmh > 120) path.push({ lat: Number.NaN, lng: Number.NaN });
    }
    path.push({ lat: event.lat, lng: event.lng });
    previous = event;
  });
  return path;
}
function summarizeLocationEvents(events: StaffLocationEvent[]) {
  let distanceKm = 0;
  let previous: StaffLocationEvent | null = null;
  events.forEach((event) => {
    if (!isReliableLocationEvent(event)) {
      previous = null;
      return;
    }
    if (!previous) {
      previous = event;
      return;
    }
    const gapMinutes = (new Date(event.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 60000;
    const segmentKm = haversineKm(previous.lat, previous.lng, event.lat, event.lng);
    const speedKmh = gapMinutes > 0 ? (segmentKm / gapMinutes) * 60 : 0;
    if (gapMinutes <= 5 && speedKmh <= 120) distanceKm += segmentKm;
    previous = event;
  });
  const first = events[0]?.recordedAt ? new Date(events[0].recordedAt).getTime() : 0;
  const last = events[events.length - 1]?.recordedAt ? new Date(events[events.length - 1].recordedAt).getTime() : 0;
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: first && last ? Math.max(0, Math.round((last - first) / 60000)) : 0
  };
}
function getCompletionOrderLabel(completion: DeliveryCompletionEvent) {
  if (!completion.plannedOrder) return "계획 미지정";
  if (completion.plannedOrder === completion.actualOrder) return `계획 ${completion.plannedOrder} 일치`;
  return `계획 ${completion.plannedOrder}`;
}
function getCompletionOrderClass(completion: DeliveryCompletionEvent) {
  if (!completion.plannedOrder) return "bg-white text-slate-500 ring-slate-200";
  if (completion.plannedOrder === completion.actualOrder) return "bg-teal-50 text-teal-800 ring-teal-100";
  return "bg-amber-50 text-amber-800 ring-amber-100";
}

export function DeliveryHistoryView({ companyId, onOpenStore, stores }: DeliveryHistoryViewProps) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [history, setHistory] = useState<DeliveryHistoryDay | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [activeDriverName, setActiveDriverName] = useState("");

  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const first = new Date(cursor.year, cursor.month, 1);
        const last = new Date(cursor.year, cursor.month + 1, 0);
        const search = new URLSearchParams({
          from: toDateKey(first.getFullYear(), first.getMonth(), first.getDate()),
          mode: "summary",
          to: toDateKey(last.getFullYear(), last.getMonth(), last.getDate())
        });
        if (companyId) search.set("companyId", companyId);
        const response = await fetchWithTimeout(`/api/routes/history?${search.toString()}`, { cache: "no-store" }, 10000);
        const payload = (await response.json().catch(() => null)) as { counts?: Record<string, number> } | null;
        if (!cancelled && response.ok) setCounts(payload?.counts || {});
      } catch {
        // 달력 배지는 보조 정보라 실패해도 조용히 넘어갑니다(빈 배지로 표시).
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [cursor, companyId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDetailLoading(true);
      setDetailError("");
      try {
        const search = new URLSearchParams({ date: selectedDate, mode: "detail" });
        if (companyId) search.set("companyId", companyId);
        const response = await fetchWithTimeout(`/api/routes/history?${search.toString()}`, { cache: "no-store" }, 12000);
        const payload = (await response.json().catch(() => null)) as { error?: string; history?: DeliveryHistoryDay } | null;
        if (!response.ok) throw new Error(payload?.error || "배송 히스토리를 불러오지 못했습니다.");
        if (!cancelled) {
          const nextHistory = payload?.history || null;
          setHistory(nextHistory);
          setActiveDriverName((current) => {
            if (current && nextHistory?.drivers.some((driver) => driver.driverName === current)) return current;
            return nextHistory?.drivers[0]?.driverName || "";
          });
        }
      } catch (error) {
        if (!cancelled) {
          setHistory(null);
          setDetailError(error instanceof Error ? error.message : "배송 히스토리를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, companyId]);

  const calendarCells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const leadingBlanks = first.getDay();
    const cells: Array<{ count: number; dateKey: string; day: number } | null> = [];
    for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = toDateKey(cursor.year, cursor.month, day);
      cells.push({ count: counts[dateKey] || 0, dateKey, day });
    }
    return cells;
  }, [cursor, counts]);

  const activeDriver: DeliveryHistoryDriverGroup | undefined = useMemo(
    () => history?.drivers.find((driver) => driver.driverName === activeDriverName),
    [history, activeDriverName]
  );
  const routeMetrics = useMemo(() => summarizeLocationEvents(activeDriver?.events || []), [activeDriver]);
  const routePath = useMemo(() => createLocationRoutePath(activeDriver?.events || []), [activeDriver]);
  const markers = useMemo<KakaoMapMarker[]>(() => {
    if (!activeDriver) return [];
    return activeDriver.completions
      .map((completion, index) => {
        const store = storeById.get(completion.customerId);
        if (!store?.address) return null;
        const marker: KakaoMapMarker = {
          address: store.address,
          completed: true,
          id: `history-${completion.id}`,
          label: `${completion.actualOrder}`,
          markerColor: completion.plannedOrder && completion.plannedOrder !== completion.actualOrder ? "#d97706" : "#0f766e",
          name: `${completion.actualOrder}. ${completion.customerName}`,
          tone: "customer" as const,
          x: 16 + ((index * 13) % 68),
          y: 18 + ((index * 17) % 58)
        };
        return marker;
      })
      .filter((marker): marker is KakaoMapMarker => Boolean(marker));
  }, [activeDriver, storeById]);
  const todayIsSelected = selectedDate === todayKey();

  return (
    <section className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="maju-section-card p-3">
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <button
              className="maju-hit-slop grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setCursor((current) => (current.month === 0 ? { month: 11, year: current.year - 1 } : { month: current.month - 1, year: current.year }))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="flex items-center gap-1.5 text-sm font-black text-slate-950">
              <CalendarDays className="h-4 w-4 text-teal-700" />
              {cursor.year}년 {cursor.month + 1}월
            </p>
            <button
              className="maju-hit-slop grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setCursor((current) => (current.month === 11 ? { month: 0, year: current.year + 1 } : { month: current.month + 1, year: current.year }))}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 px-1">
            {WEEKDAY_LABELS.map((label) => (
              <div className="py-1 text-center text-[10px] font-black text-slate-400" key={label}>
                {label}
              </div>
            ))}
            {calendarCells.map((cell, index) => {
              if (!cell) return <div key={`blank-${index}`} />;
              const selected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === todayKey();
              return (
                <button
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-black transition ${
                    selected
                      ? "bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]"
                      : isToday
                        ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200"
                        : "text-slate-700 hover:bg-slate-50"
                  }`}
                  key={cell.dateKey}
                  onClick={() => setSelectedDate(cell.dateKey)}
                  type="button"
                >
                  <span>{cell.day}</span>
                  {cell.count > 0 ? (
                    <span
                      className={`rounded-full px-1.5 text-[9px] font-black ${
                        selected ? "bg-white/25 text-white" : "bg-teal-100 text-teal-800"
                      }`}
                    >
                      {cell.count}건
                    </span>
                  ) : (
                    <span className="h-3" />
                  )}
                </button>
              );
            })}
          </div>
          {!todayIsSelected ? (
            <button
              className="maju-button-secondary mt-2 h-8 w-full text-[11px]"
              onClick={() => {
                setSelectedDate(todayKey());
                setCursor(() => {
                  const now = new Date();
                  return { month: now.getMonth(), year: now.getFullYear() };
                });
              }}
              type="button"
            >
              오늘로 이동
            </button>
          ) : null}
        </div>

        <div className="maju-section-card flex min-h-[520px] flex-col">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase text-teal-700">배송 히스토리</p>
              <h3 className="mt-0.5 text-base font-black text-slate-950">{formatDateKeyLabel(selectedDate)}</h3>
            </div>
            <Badge className="bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-100">
              {history ? `배송완료 ${history.totalCompletions.toLocaleString()}건` : "-"}
            </Badge>
          </header>

          {detailLoading ? (
            <div className="grid flex-1 place-items-center gap-2 p-8 text-center text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              그날의 배송 기록을 불러오는 중입니다.
            </div>
          ) : detailError ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm font-bold text-rose-600">{detailError}</div>
          ) : !history || (!history.drivers.length && !history.unassignedCompletions.length) ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm font-bold text-slate-500">
              이 날짜에는 저장된 배송완료 기록이 없습니다.
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_300px]">
              <div className="min-h-[360px] bg-slate-100">
                {activeDriver?.events.length ? (
                  <KakaoAddressMap mapClassName="h-full min-h-[360px] rounded-none border-0" markers={markers} routePath={routePath} showList={false} />
                ) : (
                  <div className="grid h-full min-h-[360px] place-items-center p-6 text-center text-sm font-bold text-slate-500">
                    {activeDriver ? "이 담당자의 그날 GPS 기록이 없습니다." : "왼쪽 담당자를 선택하면 경로가 표시됩니다."}
                  </div>
                )}
              </div>
              <aside className="min-h-0 overflow-auto border-l border-slate-200 bg-white p-3">
                {history.drivers.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {history.drivers.map((driver) => (
                      <button
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                          driver.driverName === activeDriverName
                            ? "bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]"
                            : "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100"
                        }`}
                        key={driver.driverName}
                        onClick={() => setActiveDriverName(driver.driverName)}
                        type="button"
                      >
                        <Truck className="h-3 w-3" />
                        {driver.driverName}
                        <span className="rounded-full bg-white/25 px-1.5">{driver.completions.length}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {activeDriver ? (
                  <>
                    {!activeDriver.planMatchedThatDay && activeDriver.completions.length ? (
                      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-bold leading-4 text-amber-800">
                        이 날짜엔 코스 확정 기록이 없어, 계획 순서는 현재 등록된 담당자 값으로 추정한 것입니다.
                      </p>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <RouteMetric label="실제 이동" value={`${routeMetrics.distanceKm.toLocaleString()}km`} />
                      <RouteMetric label="운행 시간" value={formatMinutes(routeMetrics.durationMinutes)} />
                      <RouteMetric label="완료 매장" value={`${activeDriver.completions.length.toLocaleString()}곳`} />
                      <RouteMetric label="배송차량" value={activeDriver.deliveryVehicle || "-"} />
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                        <p className="text-xs font-black text-slate-950">방문 순서</p>
                        <Badge className="bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-100">{activeDriver.completions.length}건</Badge>
                      </div>
                      <div className="max-h-72 overflow-auto p-2">
                        {activeDriver.completions.length ? (
                          <div className="space-y-1.5">
                            {activeDriver.completions.map((completion) => (
                              <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5" key={completion.id}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="min-w-0 truncate text-[11px] font-black text-slate-900">
                                    {completion.actualOrder}. {completion.customerName}
                                  </p>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ring-inset ${getCompletionOrderClass(completion)}`}>
                                    {getCompletionOrderLabel(completion)}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-[10px] font-bold text-slate-500">
                                  {new Date(completion.completedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                  {completion.statusLabel ? ` · ${completion.statusLabel}` : ""}
                                </p>
                                <div className="mt-1 flex items-center justify-between gap-2">
                                  <p className="min-w-0 truncate text-[10px] font-bold text-slate-400">{completion.memoSnippet || "완료 메모 없음"}</p>
                                  <button
                                    className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-teal-700 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-50"
                                    onClick={() => onOpenStore(completion.customerId)}
                                    type="button"
                                  >
                                    열기
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-md bg-slate-50 p-3 text-[11px] font-bold text-slate-500">이 담당자의 완료 기록이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                {history.unassignedCompletions.length ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <p className="text-xs font-black text-slate-950">담당자 미확인 완료 {history.unassignedCompletions.length}건</p>
                    </div>
                    <div className="max-h-40 overflow-auto p-2">
                      {history.unassignedCompletions.map((completion) => (
                        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5" key={completion.id}>
                          <p className="min-w-0 truncate text-[11px] font-bold text-slate-700">{completion.customerName}</p>
                          <button
                            className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-teal-700 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-50"
                            onClick={() => onOpenStore(completion.customerId)}
                            type="button"
                          >
                            열기
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
