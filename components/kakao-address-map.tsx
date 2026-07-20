"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, ExternalLink, MapPin, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type KakaoMapMarker = {
  readonly address: string;
  readonly grade?: "A" | "B" | "C";
  readonly id?: string;
  readonly label: string;
  readonly markerColor?: string;
  readonly name: string;
  readonly tone: "customer" | "lead" | "origin";
  readonly x: number;
  readonly y: number;
};

export type KakaoRoutePoint = {
  readonly lat: number;
  readonly lng: number;
};

type KakaoAddressMapProps = {
  readonly focusedMarkerId?: string;
  readonly mapClassName?: string;
  readonly markers: ReadonlyArray<KakaoMapMarker>;
  readonly onMarkerClick?: (marker: KakaoMapMarker) => void;
  readonly routePath?: ReadonlyArray<KakaoRoutePoint>;
  readonly showList?: boolean;
};

declare global {
  interface Window {
    kakao?: any;
  }
}

let kakaoScriptPromise: Promise<void> | null = null;
const emptyRoutePath: ReadonlyArray<KakaoRoutePoint> = [];
const defaultMapClassName = "h-[360px]";

export function KakaoAddressMap({ focusedMarkerId, mapClassName = defaultMapClassName, markers, onMarkerClick, routePath = emptyRoutePath, showList = true }: KakaoAddressMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundsRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const canUseKakao = useMemo(() => Boolean(appKey && appKey !== "replace-with-kakao-javascript-key"), [appKey]);
  const focusedMarker = useMemo(() => markers.find((marker) => marker.id === focusedMarkerId), [focusedMarkerId, markers]);

  useEffect(() => {
    let ignore = false;

    async function bootMap() {
      if (!canUseKakao || !mapRef.current) {
        setStatus("fallback");
        return;
      }

      try {
        await loadKakaoMapSdk(appKey!);
        if (ignore || !mapRef.current || !window.kakao?.maps) return;

        const kakao = window.kakao;
        const initialCenter = new kakao.maps.LatLng(37.5388, 127.2124);
        const map = new kakao.maps.Map(mapRef.current, {
          center: initialCenter,
          level: 8
        });
        mapInstanceRef.current = map;
        const geocoder = new kakao.maps.services.Geocoder();
        const bounds = new kakao.maps.LatLngBounds();
        boundsRef.current = bounds;
        let focusedPosition: any = null;
        let found = 0;
        const roadPathSegments = splitRoutePath(routePath).map((segment) => segment.map((point) => new kakao.maps.LatLng(point.lat, point.lng)));
        const hasRoadPath = roadPathSegments.some((segment) => segment.length >= 2);

        await Promise.all(
          markers.map(
            (marker) =>
              new Promise<void>((resolve) => {
                geocoder.addressSearch(marker.address, (result: any[], geocodeStatus: string) => {
                  if (ignore) {
                    resolve();
                    return;
                  }

                  if (geocodeStatus === kakao.maps.services.Status.OK && result[0]) {
                    const position = new kakao.maps.LatLng(Number(result[0].y), Number(result[0].x));
                    const overlayContent = createMarkerOverlay(marker);
                    overlayContent.addEventListener("click", () => onMarkerClick?.(marker));
                    new kakao.maps.CustomOverlay({
                      content: overlayContent,
                      map,
                      position,
                      yAnchor: 1.75
                    });

                    bounds.extend(position);
                    found += 1;
                    if (focusedMarkerId && marker.id === focusedMarkerId) {
                      focusedPosition = position;
                    }
                  }

                  resolve();
                });
              })
          )
        );

        if (ignore) return;

        if (found === 0 && !hasRoadPath) {
          setStatus("fallback");
          return;
        }

        if (hasRoadPath) {
          drawRoadRoutePolylines(kakao, map, roadPathSegments);
          roadPathSegments.flat().forEach((point) => bounds.extend(point));
          map.setBounds(bounds);
        } else if (focusedPosition) {
          map.setCenter(focusedPosition);
          map.setLevel(5);
        } else if (found === 1) {
          map.setCenter(bounds.getSouthWest());
          map.setLevel(5);
        } else {
          map.setBounds(bounds);
        }

        setStatus("ready");
      } catch {
        if (!ignore) setStatus("fallback");
      }
    }

    bootMap();

    return () => {
      ignore = true;
    };
  }, [appKey, canUseKakao, focusedMarkerId, markers, onMarkerClick, routePath]);

  if (status === "fallback") {
    return <FallbackAddressMap focusedMarkerId={focusedMarkerId} mapClassName={mapClassName} markers={markers} onMarkerClick={onMarkerClick} routePath={routePath} showList={showList} />;
  }

  const moveToCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const kakao = window.kakao;
        const map = mapInstanceRef.current;
        if (!kakao?.maps || !map) return;
        const current = new kakao.maps.LatLng(position.coords.latitude, position.coords.longitude);
        map.setCenter(current);
        map.setLevel(4);
        new kakao.maps.CustomOverlay({
          content: '<div title="내 위치" style="position:relative;width:22px;height:22px;border-radius:999px;background:rgba(37,99,235,.14);display:flex;align-items:center;justify-content:center;"><span style="width:12px;height:12px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 4px 12px rgba(37,99,235,.45);display:block;"></span></div>',
          map,
          position: current,
          yAnchor: 0.5
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
    );
  };

  const fitAllMarkers = () => {
    if (mapInstanceRef.current && boundsRef.current) {
      mapInstanceRef.current.setBounds(boundsRef.current);
    }
  };

  const openRoadview = () => {
    const center = mapInstanceRef.current?.getCenter?.();
    if (!center) return;
    const kakao = window.kakao;
    if (!kakao?.maps?.RoadviewClient) {
      openPopup(createKakaoSearchUrl(focusedMarker) || `https://map.kakao.com/link/roadview/${center.getLat()},${center.getLng()}`, "maju-kakao-roadview");
      return;
    }

    const client = new kakao.maps.RoadviewClient();
    client.getNearestPanoId(center, 180, (panoId: number | null) => {
      if (!panoId) {
        openPopup(createKakaoSearchUrl(focusedMarker) || `https://map.kakao.com/link/map/MAJU%20지도,${center.getLat()},${center.getLng()}`, "maju-kakao-roadview");
        return;
      }
      openPopup(`https://map.kakao.com/link/roadview/${center.getLat()},${center.getLng()}`, "maju-kakao-roadview");
    });
  };

  const openLargeMap = () => {
    const center = mapInstanceRef.current?.getCenter?.();
    const markerUrl = createKakaoSearchUrl(focusedMarker);
    const url = markerUrl || (center ? `https://map.kakao.com/link/map/MAJU%20지도,${center.getLat()},${center.getLng()}` : "https://map.kakao.com");
    openPopup(url, "maju-kakao-large-map");
  };

  return (
    <div className="space-y-4">
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-muted`}>
        <div ref={mapRef} className="h-full w-full" />
        <MapControls
          onFitAll={fitAllMarkers}
          onLargeMap={openLargeMap}
          onLocation={moveToCurrentLocation}
          onRoadview={openRoadview}
        />
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-white/80 text-sm font-bold text-muted-foreground backdrop-blur-sm">
            카카오맵 주소 좌표를 불러오는 중입니다.
          </div>
        )}
      </div>
      {showList && <MarkerList markers={markers} />}
    </div>
  );
}

function MapControls({
  onFitAll,
  onLargeMap,
  onLocation,
  onRoadview
}: {
  readonly onFitAll: () => void;
  readonly onLargeMap: () => void;
  readonly onLocation: () => void;
  readonly onRoadview: () => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-20 flex flex-wrap justify-end gap-2">
      <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-black text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50" onClick={onLocation} type="button">
        <Crosshair className="h-3.5 w-3.5" />
        내 위치
      </button>
      <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-black text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50" onClick={onFitAll} type="button">
        <RotateCcw className="h-3.5 w-3.5" />
        전체 보기
      </button>
      <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-xs font-black text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50" onClick={onRoadview} type="button">
        <MapPin className="h-3.5 w-3.5" />
        로드뷰
      </button>
      <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-black text-white shadow-md hover:bg-slate-800" onClick={onLargeMap} type="button">
        <ExternalLink className="h-3.5 w-3.5" />
        큰 지도
      </button>
    </div>
  );
}

function openPopup(url: string, name: string) {
  window.open(url, name, "popup=yes,width=1440,height=920,left=80,top=40,noopener,noreferrer");
}

function createKakaoSearchUrl(marker?: KakaoMapMarker) {
  if (!marker) return "";
  const query = `${marker.name} ${marker.address}`.trim();
  return query ? `https://map.kakao.com/link/search/${encodeURIComponent(query)}` : "";
}

function drawRoadRoutePolylines(kakao: any, map: any, roadPathSegments: any[][]) {
  roadPathSegments.forEach((roadPath) => {
    if (roadPath.length < 2) return;
    new kakao.maps.Polyline({
      endArrow: true,
      map,
      path: roadPath,
      strokeColor: "#0f766e",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      strokeWeight: 5
    });
  });
}

function splitRoutePath(routePath: ReadonlyArray<KakaoRoutePoint>) {
  const segments: KakaoRoutePoint[][] = [];
  let current: KakaoRoutePoint[] = [];

  routePath.forEach((point) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });

  if (current.length) segments.push(current);
  return segments;
}

function loadKakaoMapSdk(appKey: string) {
  if (window.kakao?.maps?.services) {
    return new Promise<void>((resolve) => window.kakao.maps.load(resolve));
  }

  if (kakaoScriptPromise) return kakaoScriptPromise;

  kakaoScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById("kakao-map-sdk") as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => window.kakao?.maps?.load(resolve), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Kakao map SDK load failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "kakao-map-sdk";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
    script.onload = () => window.kakao?.maps?.load(resolve);
    script.onerror = () => reject(new Error("Kakao map SDK load failed"));
    document.head.appendChild(script);
  });

  return kakaoScriptPromise;
}

function createMarkerOverlay(marker: KakaoMapMarker) {
  const toneClass = marker.tone === "origin"
      ? "background:#111827;color:#ffffff;"
      : marker.markerColor
        ? `background:${marker.markerColor};color:#ffffff;`
      : marker.grade
        ? gradeStyle(marker.grade)
        : marker.tone === "lead"
          ? "background:#059669;color:#ffffff;"
          : "background:#2563eb;color:#ffffff;";
  const label = escapeHtml(marker.label);
  const name = escapeHtml(marker.name);

  if (marker.tone === "origin") {
    return htmlToElement(`
      <button type="button" title="${name}" style="cursor:pointer;background:#0f172a;color:#ffffff;border:1px solid rgba(255,255,255,.92);border-radius:999px;display:flex;align-items:center;gap:6px;padding:6px 10px;box-shadow:0 10px 22px rgba(15,23,42,.30);font-size:12px;font-weight:900;letter-spacing:0;">
        <span style="width:7px;height:7px;border-radius:999px;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.18);display:block;"></span>
        ${label || "출발"}
      </button>
    `);
  }

  if ((marker.tone === "customer" || marker.markerColor) && /^\d+$/.test(marker.label)) {
    return htmlToElement(`
      <button type="button" title="${name}" style="cursor:pointer;${toneClass}width:30px;height:30px;border:2px solid #ffffff;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(37,99,235,.30);font-size:12px;font-weight:900;">
        ${label}
      </button>
    `);
  }

  if (marker.grade) {
    return htmlToElement(`
      <button type="button" title="${name}" style="cursor:pointer;${toneClass}width:26px;height:26px;border:2px solid #ffffff;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(15,23,42,.22);font-size:11px;font-weight:900;">
        ${label}
      </button>
    `);
  }

  return htmlToElement(`
    <button type="button" title="${name}" style="cursor:pointer;${toneClass}border:0;border-radius:8px;padding:7px 9px;box-shadow:0 8px 18px rgba(15,23,42,.22);font-size:12px;font-weight:800;white-space:nowrap;">
      ${label} · ${name}
    </button>
  `);
}

function htmlToElement(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function gradeStyle(grade: "A" | "B" | "C") {
  if (grade === "A") return "background:#7c3aed;color:#ffffff;";
  if (grade === "B") return "background:#2563eb;color:#ffffff;";
  return "background:#64748b;color:#ffffff;";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function FallbackAddressMap({
  focusedMarkerId,
  mapClassName = defaultMapClassName,
  markers,
  onMarkerClick,
  routePath,
  showList
}: KakaoAddressMapProps) {
  const focusedMarker = markers.find((marker) => marker.id === focusedMarkerId);
  const displayMarkers = focusedMarker?.id ? prioritizeFocusedMarker(markers, focusedMarker.id) : markers;
  const firstMarker = markers.find((marker) => marker.tone !== "origin") || markers[0];

  return (
    <div className="space-y-4">
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-[linear-gradient(135deg,#eef7f2_0%,#eef7f2_34%,#f8fafc_34%,#f8fafc_45%,#edf2ff_45%,#edf2ff_100%)]`}>
        <div className="absolute right-3 top-3 z-30">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-black text-white shadow-md hover:bg-slate-800"
            onClick={() => openPopup(firstMarker ? `https://map.kakao.com/link/search/${encodeURIComponent(firstMarker.address)}` : "https://map.kakao.com", "maju-kakao-large-map")}
            type="button"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            큰 지도
          </button>
        </div>
        <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-2 text-xs font-bold text-muted-foreground shadow-sm">
          {routePath?.length ? "카카오맵 로딩 후 티맵 도로 경로가 표시됩니다." : "지도 좌표를 불러오지 못해 마커 위치만 표시합니다."}
        </div>
        {displayMarkers.map((marker) => {
          const focused = focusedMarkerId && marker.id === focusedMarkerId;
          return (
          <button
            type="button"
            key={`${marker.label}-${marker.address}`}
            className={`group absolute -translate-x-1/2 -translate-y-1/2 text-left ${focused ? "z-20" : "z-10"}`}
            onClick={() => onMarkerClick?.(marker)}
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          >
            <span
              className={`flex items-center justify-center rounded-full border-2 border-white text-xs font-black text-white shadow-lg ${focused ? "h-12 min-w-12 px-2 ring-4 ring-blue-200" : "h-7 min-w-7 px-1"} ${
                marker.markerColor
                  ? ""
                  : marker.grade === "A"
                  ? "bg-violet-700"
                  : marker.grade === "B"
                    ? "bg-blue-600"
                    : marker.grade === "C"
                      ? "bg-slate-500"
                      : marker.tone === "origin"
                        ? "bg-slate-950"
                        : marker.tone === "lead"
                          ? "bg-emerald-600"
                          : "bg-primary"
              }`}
              style={marker.markerColor ? { backgroundColor: marker.markerColor } : undefined}
            >
              {marker.label}
            </span>
            <div className="pointer-events-none absolute left-1/2 top-10 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs shadow-lg group-hover:block">
              <p className="font-black">{marker.name}</p>
              <p className="mt-1 leading-5 text-muted-foreground">{marker.address}</p>
            </div>
          </button>
          );
        })}
      </div>
      {showList && <MarkerList markers={markers} />}
    </div>
  );
}

function prioritizeFocusedMarker(markers: ReadonlyArray<KakaoMapMarker>, focusedId: string) {
  return [...markers.filter((marker) => marker.id !== focusedId), ...markers.filter((marker) => marker.id === focusedId)];
}

function MarkerList({ markers }: { readonly markers: ReadonlyArray<KakaoMapMarker> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {markers.map((marker) => (
        <div key={`${marker.label}-${marker.name}`} className="rounded-md border border-border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-black">{marker.name}</p>
            <Badge
              className={
                marker.grade === "A"
                  ? "bg-violet-700 text-white"
                  : marker.grade === "B"
                    ? "bg-blue-600 text-white"
                    : marker.grade === "C"
                      ? "bg-slate-500 text-white"
                      : marker.tone === "origin"
                        ? "bg-slate-950 text-white"
                        : marker.tone === "lead"
                          ? "bg-emerald-600 text-white"
                          : ""
              }
              style={marker.markerColor ? { backgroundColor: marker.markerColor, color: "#fff" } : undefined}
            >
              {marker.grade ? `${marker.grade}등급` : marker.tone === "origin" ? "출발지" : marker.tone === "lead" ? "신규" : "거래처"}
            </Badge>
          </div>
          <p className="mt-2 flex gap-1 text-xs leading-5 text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{marker.address}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
