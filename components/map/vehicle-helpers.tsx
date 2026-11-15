"use client";

import { KakaoMapMarker } from "@/components/kakao-address-map";
import { operationalMarkerPersonIcon } from "@/lib/route-map-markers";
import type {
  
  DeliveryCompletionEvent,
  DeliveryVehicle,
  
  
  
  
  
  
  
  StaffLocationEvent,
  StaffVehicleLocation
} from "@/lib/store";
import {
  
  
  
  
  
  haversineKm,
} from "@/lib/route-map-utils";
import { type StoreRow } from "@/components/map/map-row-helpers";
// M6: 차량·코스 표시용 순수 함수와 작은 부품. 워크스페이스를 import하지 않는다.
export type VehicleEdit = Partial<Pick<DeliveryVehicle, "area" | "driver" | "fuelType" | "name">>;

// 2026-09-07 피드백("직원들이 많아질수록 보기 쉽게 구현해"): 활성 차량이 전부 같은 청록색이면
// 배송기사가 여러 명일 때 지도 위에서도, 목록에서도 "이 마커가 그 사람 것"인지 구분이 안 됩니다.
// 차량 ID(staff_mobile_devices.id, 로그인마다 안정적으로 유지됨)를 해시해 고정 팔레트에서 색을
// 골라, 같은 사람은 새로고침해도 항상 같은 색으로 보이게 합니다. 지연(isStale) 차량은 팔레트
// 대신 회색으로 통일해 "지금 안 잡히는 차량"이라는 상태를 우선 눈에 띄게 합니다.
const VEHICLE_COLOR_PALETTE = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#65a30d", "#0891b2", "#c026d3"];
export function vehicleColorForId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return VEHICLE_COLOR_PALETTE[hash % VEHICLE_COLOR_PALETTE.length];
}

export function liveVehicleMatchesDeliveryGroup(location: StaffVehicleLocation, vehicle: DeliveryVehicle) {
  const locationKeys = [location.assignedManagerName, location.displayName, location.deliveryVehicle]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);
  const vehicleKeys = [vehicle.name, vehicle.driver, ...vehicle.stops.flatMap((stop) => [stop.deliveryDriver, stop.deliveryVehicle])]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);
  return locationKeys.some((key) => vehicleKeys.includes(key));
}

export function createLiveVehicleMarkers(locations: StaffVehicleLocation[], storeById: Map<string, StoreRow>): KakaoMapMarker[] {
  return locations
    .filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng))
    .map((location) => {
      const label = (location.deliveryVehicle || location.driverName || "차량").replace(/\s+/g, " ").slice(0, 8);
      const checkedAt = location.lastLocationAt ? new Date(location.lastLocationAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "시간 미확인";
      const accuracyText = Number.isFinite(location.accuracyMeters) ? ` · 오차 ${Math.round(location.accuracyMeters || 0)}m` : "";
      const statusText = getVehicleMarkerStatusText(location);
      const vehicleAssigned = Boolean(location.deliveryVehicle?.trim());
      const currentStore = location.currentCustomerId ? storeById.get(location.currentCustomerId) : undefined;
      const currentStoreText = currentStore ? ` · 작업 ${currentStore.name}` : "";
      const driverName = location.driverName || location.deliveryVehicle || "라이브 차량";
      return {
        address: `${statusText}${location.displayState === "last_operation" ? "" : ` · ${checkedAt}`}${currentStoreText}${accuracyText}`,
        id: `vehicle-${location.id}`,
        label,
        lat: location.lat,
        lng: location.lng,
        markerColor: location.displayState === "last_operation" ? "#cbd5e1" : location.isStale ? "#64748b" : vehicleColorForId(location.id),
        name: `${driverName} · ${vehicleAssigned ? "차량 배정" : "차량 미배정 직원"} · ${statusText}${location.displayState === "last_operation" ? "" : ` · ${checkedAt}`}${currentStoreText}${accuracyText}`,
        tone: "vehicle" as const,
        vehicleIcon: operationalMarkerPersonIcon(location.deliveryVehicle),
        x: 50,
        y: 50
      };
    });
}

export function createLocationRoutePath(events: StaffLocationEvent[]) {
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

export function summarizeLocationEvents(events: StaffLocationEvent[]) {
  let distanceKm = 0;
  let gapCount = 0;
  let ignoredCount = 0;
  let previous: StaffLocationEvent | null = null;
  events.forEach((event) => {
    if (!isReliableLocationEvent(event)) {
      ignoredCount += 1;
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
    if (gapMinutes > 5) {
      gapCount += 1;
    } else if (speedKmh > 120) {
      ignoredCount += 1;
    } else {
      distanceKm += segmentKm;
    }
    previous = event;
  });
  const first = events[0]?.recordedAt ? new Date(events[0].recordedAt).getTime() : 0;
  const last = events[events.length - 1]?.recordedAt ? new Date(events[events.length - 1].recordedAt).getTime() : 0;
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes: first && last ? Math.max(0, Math.round((last - first) / 60000)) : 0,
    gapCount,
    ignoredCount
  };
}

export function isReliableLocationEvent(event: StaffLocationEvent) {
  return Number.isFinite(event.lat) && Number.isFinite(event.lng) && (!Number.isFinite(event.accuracyMeters) || Number(event.accuracyMeters) <= 150);
}

export function summarizeCompletionOrder(completions: DeliveryCompletionEvent[]) {
  const planned = completions.filter((completion) => Number.isFinite(completion.plannedOrder));
  if (!planned.length) return { label: "-" };
  const matched = planned.filter((completion) => completion.plannedOrder === completion.actualOrder).length;
  return { label: `${matched}/${planned.length}` };
}

export function getVehicleStatusLabel(vehicle: StaffVehicleLocation) {
  if (vehicle.displayState === "last_operation") return "마지막 운행";
  if (vehicle.isStale) return "지연";
  if (vehicle.status === "paused") return "대기";
  if (vehicle.status === "offline") return "종료";
  return "활성";
}

export function formatVehicleLocationAge(lastLocationAt?: string) {
  if (!lastLocationAt) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(lastLocationAt).getTime()) / 60000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export function formatLastOperationAt(lastLocationAt?: string) {
  if (!lastLocationAt) return "마지막 운행 시간 미확인";
  return `마지막 운행 ${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit"
  }).format(new Date(lastLocationAt))}`;
}

export function getVehicleMarkerStatusText(vehicle: StaffVehicleLocation) {
  if (vehicle.displayState === "last_operation") return formatLastOperationAt(vehicle.lastLocationAt);
  if (vehicle.isStale) return "위치 지연";
  if (vehicle.status === "paused") return "화면 대기";
  if (vehicle.status === "offline") return "위치 종료";
  return "실시간 위치";
}

export function getCompletionOrderLabel(completion: DeliveryCompletionEvent) {
  if (!completion.plannedOrder) return "계획 미지정";
  if (completion.plannedOrder === completion.actualOrder) return `계획 ${completion.plannedOrder} 일치`;
  return `계획 ${completion.plannedOrder}`;
}

export function getCompletionOrderClass(completion: DeliveryCompletionEvent) {
  if (!completion.plannedOrder) return "bg-white text-slate-500 ring-slate-200";
  if (completion.plannedOrder === completion.actualOrder) return "bg-teal-50 text-teal-800 ring-teal-100";
  return "bg-amber-50 text-amber-800 ring-amber-100";
}


export function RouteMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
