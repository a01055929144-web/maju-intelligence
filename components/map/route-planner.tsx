"use client";

import Link from "next/link";
import { useState } from "react";
import type { MouseEvent, } from "react";
import {
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  Navigation,
} from "lucide-react";
import { buildRouteNavigationLinks, GeoPoint, NavigationStop } from "@/lib/navigation-links";
import { type StoreRow } from "@/components/map/map-row-helpers";
import { RouteMetric, vehicleColorForId } from "@/components/map/vehicle-helpers";
export { RouteMetric, vehicleColorForId };

export type MarkerViewMode = "grade" | "vehicle";
export type WorkspaceView = "map" | "customers" | "course" | "leads" | "history";
export type CourseSummary = {
  distanceKm: number;
  durationMinutes: number;
  expectedRevenue: number;
  selectedCount: number;
};

export function getRouteStopAddress(store: StoreRow) {
  return store.address || store.region;
}

// M7(45-3f): 코스 안내·길찾기 메뉴(주소→좌표는 세션 캐시). 워크스페이스를 import하지 않는다.
export function RouteWorkspaceGuide({
  activeView,
  courseSummary,
  dataRegistrationHref,
  markerViewMode,
  selectedVehicleLabel,
  sourceReady,
  visibleStoreCount
}: {
  readonly activeView: WorkspaceView;
  readonly courseSummary: CourseSummary | null;
  readonly dataRegistrationHref: string;
  readonly markerViewMode: MarkerViewMode;
  readonly selectedVehicleLabel: string;
  readonly sourceReady: boolean;
  readonly visibleStoreCount: number;
}) {
  const viewLabel =
    activeView === "map"
      ? "지도 홈"
      : activeView === "customers"
        ? "거래처"
        : activeView === "leads"
          ? "신규리드"
          : activeView === "history"
            ? "배송 이력"
            : "방문 코스";
  const markerLabel = markerViewMode === "grade" ? "등급별 보기" : "차량별 보기";
  const guide =
    !sourceReady
      ? "거래처를 등록하면 지도, 목록, 배송차 경유 계산이 같은 기준으로 열립니다."
      : activeView === "course"
      ? courseSummary
        ? `${selectedVehicleLabel} 기준 경유 ${courseSummary.selectedCount}곳의 도로 거리와 시간이 계산되었습니다.`
        : `${selectedVehicleLabel} 기준 방문 거래처를 선택한 뒤 티맵 계산을 실행하세요.`
      : activeView === "customers"
        ? "목록에서 거래처를 누르면 상세 패널에서 원장, 첨부자료, 메모를 편집할 수 있습니다."
        : activeView === "leads"
          ? "사업자 인허가 데이터를 업로드하고, 기존 거래처 주변 반경에서 신규리드를 탐색하세요."
          : activeView === "history"
            ? "달력에서 날짜를 고르면 그날 담당자별 방문 순서와 실제 이동 경로를 볼 수 있습니다."
            : "마커를 선택하면 간략 정보와 상세 이동 버튼이 열립니다.";

  return (
    <section className="shrink-0 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-800 ring-1 ring-inset ring-slate-200">{viewLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-100">{markerLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-100">{visibleStoreCount.toLocaleString()}곳 표시</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          <p className="min-w-0 text-xs font-bold leading-5 text-slate-500 lg:text-right">{guide}</p>
          {!sourceReady ? (
            <Link className="maju-button-primary h-8" href={dataRegistrationHref}>
              거래처 등록
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** On-demand geocode for one destination (and optionally an origin) via /api/routes/geocode. */
// 세션 캐시: 같은 주소는 탭이 열려 있는 동안 서버에 다시 묻지 않는다(찾지 못한 주소(null)도 기억 — 새로고침하면 다시 시도).
const geocodeSessionCache = new Map<string, GeoPoint | null>();
async function geocodeAddresses(addresses: string[]): Promise<Record<string, GeoPoint | null>> {
  const uniqueAddresses = Array.from(new Set(addresses.filter(Boolean)));
  if (!uniqueAddresses.length) return {};
  const missing = uniqueAddresses.filter((address) => !geocodeSessionCache.has(address));
  if (missing.length) {
    const response = await fetch("/api/routes/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: missing })
    }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json().catch(() => null);
      const points: Record<string, GeoPoint | null> = payload?.points || {};
      missing.forEach((address) => geocodeSessionCache.set(address, points[address] ?? null));
    }
  }
  return Object.fromEntries(uniqueAddresses.filter((address) => geocodeSessionCache.has(address)).map((address) => [address, geocodeSessionCache.get(address) ?? null]));
}

/**
 * Inline "길찾기" action: resolves real coordinates for origin/destination on first open (via
 * /api/routes/geocode) and offers a real turn-by-turn route in Kakao Map (works with or without
 * the app), plus app-required Naver Map / Tmap options, with a plain search-link fallback if
 * coordinates couldn't be resolved. See lib/navigation-links.ts for why Kakao is the default.
 */
export function NavigateMenu({
  compact,
  destinationAddress,
  destinationName,
  knownDestinationPoint,
  knownOriginPoint,
  originAddress
}: {
  readonly compact?: boolean;
  readonly destinationAddress?: string;
  readonly destinationName: string;
  /** Skip the geocode round-trip when the caller already resolved these (e.g. from a Tmap route calc). */
  readonly knownDestinationPoint?: GeoPoint | null;
  readonly knownOriginPoint?: GeoPoint | null;
  readonly originAddress?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [points, setPoints] = useState<{ origin: GeoPoint | null; destination: GeoPoint | null } | null>(
    knownDestinationPoint !== undefined ? { origin: knownOriginPoint || null, destination: knownDestinationPoint } : null
  );

  async function handleToggle(event: MouseEvent) {
    event.stopPropagation();
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !points && destinationAddress) {
      setIsLoading(true);
      const resolved = await geocodeAddresses([originAddress || "", destinationAddress]);
      setPoints({
        origin: (originAddress && resolved[originAddress]) || null,
        destination: resolved[destinationAddress] || null
      });
      setIsLoading(false);
    }
  }

  const origin: NavigationStop = { name: "출발지", point: points?.origin || null };
  const destination: NavigationStop = { name: destinationName, point: points?.destination || null };
  const links = buildRouteNavigationLinks(origin, destination);

  return (
    <div className="relative">
      <button
        className={compact ? "maju-button-secondary inline-flex h-6 items-center gap-1 px-2 text-[11px]" : "maju-button-secondary h-8 shrink-0 px-3 text-xs"}
        onClick={handleToggle}
        type="button"
      >
        <Navigation className="h-3 w-3" />
        길찾기
      </button>
      {isOpen ? (
        <div
          className="absolute right-0 top-8 z-40 w-56 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          {isLoading ? (
            <p className="px-2 py-2 text-xs font-bold text-slate-400">위치 확인 중...</p>
          ) : (
            <>
              <a
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-black text-slate-900 hover:bg-teal-50"
                href={links.kakaoWebUrl}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                카카오맵으로 길찾기
                <span className="text-xs font-bold text-teal-700">기본</span>
              </a>
              <a
                aria-disabled={!links.naverAppUrl}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold ${
                  links.naverAppUrl ? "text-slate-700 hover:bg-slate-50" : "pointer-events-none text-slate-300"
                }`}
                href={links.naverAppUrl || undefined}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                네이버지도 앱 길찾기
                <span className="text-xs font-bold text-slate-400">앱 필요</span>
              </a>
              <a
                aria-disabled={!links.tmapAppUrl}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold ${
                  links.tmapAppUrl ? "text-slate-700 hover:bg-slate-50" : "pointer-events-none text-slate-300"
                }`}
                href={links.tmapAppUrl || undefined}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                티맵 길찾기
                <span className="text-xs font-bold text-slate-400">앱 필요</span>
              </a>
              <a
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
                href={links.naverSearchUrl}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                네이버 지도에서 검색
              </a>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * "전체 경로 길찾기": builds one real multi-stop route (출발지 -> 경유지... -> 마지막 배송지)
 * from the already-Tmap-geocoded course, instead of a single-place search link. Kakao Map
 * supports up to 5 waypoints via URL scheme, so a course longer than 6 stops (start + 5 vias +
 * destination) is capped to the first 5 vias + final destination and flagged as partial.
 */
export function FullRouteNavigateAction({
  originLabel,
  originPoint,
  stopPointByAddress,
  stores
}: {
  readonly originLabel: string;
  readonly originPoint?: GeoPoint | null;
  readonly stopPointByAddress: Map<string, GeoPoint | null>;
  readonly stores: StoreRow[];
}) {
  if (!stores.length) return null;

  const stops: NavigationStop[] = stores.map((store) => ({
    name: store.name,
    point: stopPointByAddress.get(getRouteStopAddress(store)) || null
  }));
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const links = buildRouteNavigationLinks({ name: originLabel, point: originPoint || null }, destination, waypoints);
  const isPartial = stops.length > 6;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-black text-slate-950">전체 경로 길찾기</p>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
        {links.hasCoordinates
          ? `${originLabel} → ${isPartial ? "경유지 5곳" : `경유지 ${waypoints.length}곳`} → ${destination.name}${isPartial ? " (카카오맵 경유지 제한으로 앞 5곳만 반영)" : ""}`
          : "좌표를 확인할 수 없어 첫 배송지 검색으로 대체합니다."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="maju-button-primary h-9 px-3 text-xs" href={links.kakaoWebUrl} rel="noreferrer" target="_blank">
          <Navigation className="h-3.5 w-3.5" />
          카카오맵으로 전체 경로 길찾기
        </a>
        {links.naverAppUrl ? (
          <a className="maju-button-secondary h-9 px-3 text-xs" href={links.naverAppUrl} rel="noreferrer" target="_blank">
            네이버지도 앱 (경유지 포함)
          </a>
        ) : null}
      </div>
    </div>
  );
}

