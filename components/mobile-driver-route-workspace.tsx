"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ClipboardList, History, MoreHorizontal } from "lucide-react";
import { KakaoAddressMap, type KakaoMapMarker } from "@/components/kakao-address-map";
import { BottomNav, BottomSheet, type SheetHeight } from "@/components/ui/mobile";

type DriverStop = {
  readonly address?: string;
  readonly completed: boolean;
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly point?: { readonly lat: number; readonly lng: number } | null;
  readonly region: string;
};

export function MobileDriverRouteWorkspace({
  children,
  driverName,
  selectedStopId,
  stops,
  vehicleLabel
}: {
  readonly children: ReactNode;
  readonly driverName: string;
  readonly selectedStopId?: string;
  readonly stops: readonly DriverStop[];
  readonly vehicleLabel?: string;
}) {
  const [height, setHeight] = useState<SheetHeight>("medium");
  const completedCount = stops.filter((stop) => stop.completed).length;
  const selectedIndex = Math.max(0, stops.findIndex((stop) => stop.id === selectedStopId));
  const markers = useMemo<KakaoMapMarker[]>(() => stops.map((stop) => ({
    address: stop.address || stop.region,
    completed: stop.completed,
    id: stop.id,
    label: String(stop.order),
    ...(stop.point ?? {}),
    name: stop.name,
    tone: "customer",
    x: 0,
    y: 0
  })), [stops]);

  return (
    <section className="relative h-[100dvh] w-full overflow-hidden bg-slate-100" data-testid="driver-route-workspace">
      <KakaoAddressMap
        focusedMarkerId={selectedStopId}
        mapClassName="h-full w-full"
        markers={markers}
        showList={false}
      />

      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto flex max-w-[480px] items-center justify-between gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <span className="pointer-events-auto rounded-full bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow-lg">
          운행 중 · {vehicleLabel || driverName}
        </span>
        <button
          className="pointer-events-auto rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow-lg ring-1 ring-slate-200"
          onClick={() => setHeight("large")}
          type="button"
        >
          {stops.length ? `${selectedIndex + 1}/${stops.length}` : "0/0"} · 목록
        </button>
      </div>

      <BottomSheet aboveBottomNav height={height} mode="docked" onHeightChange={setHeight} title="지금 할 일">
        <div className="mb-3" aria-label={`배송 진행 ${completedCount}/${stops.length}`}>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>{completedCount}곳 완료</span><span>{Math.max(0, stops.length - completedCount)}곳 남음</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-teal-600 transition-[width]" style={{ width: `${stops.length ? completedCount / stops.length * 100 : 0}%` }} />
          </div>
        </div>
        {children}
      </BottomSheet>

      <div className="fixed inset-x-0 bottom-0 z-[80] mx-auto max-w-[480px]">
        <BottomNav
          ariaLabel="기사 하단 메뉴"
          items={[
            { active: true, href: "/mobile/today", icon: <ClipboardList className="h-5 w-5" />, label: "오늘 코스" },
            { href: "/mobile/today#delivery-history", icon: <History className="h-5 w-5" />, label: "배송 기록" },
            { href: "/mobile", icon: <MoreHorizontal className="h-5 w-5" />, label: "더보기" }
          ]}
        />
      </div>
    </section>
  );
}
