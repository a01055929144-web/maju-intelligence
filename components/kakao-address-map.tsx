"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type KakaoMapMarker = {
  readonly address: string;
  readonly label: string;
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
  readonly mapClassName?: string;
  readonly markers: ReadonlyArray<KakaoMapMarker>;
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

export function KakaoAddressMap({ mapClassName = defaultMapClassName, markers, routePath = emptyRoutePath, showList = true }: KakaoAddressMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const canUseKakao = useMemo(() => Boolean(appKey && appKey !== "replace-with-kakao-javascript-key"), [appKey]);

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
        const geocoder = new kakao.maps.services.Geocoder();
        const bounds = new kakao.maps.LatLngBounds();
        let found = 0;
        const roadPath = routePath
          .map((point) => new kakao.maps.LatLng(point.lat, point.lng))
          .filter((point) => Number.isFinite(point.getLat()) && Number.isFinite(point.getLng()));

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
                    const point = new kakao.maps.Marker({ map, position });
                    const overlay = new kakao.maps.CustomOverlay({
                      content: createMarkerOverlay(marker),
                      map,
                      position,
                      yAnchor: 1.75
                    });

                    kakao.maps.event.addListener(point, "click", () => {
                      overlay.setMap(overlay.getMap() ? null : map);
                    });

                    bounds.extend(position);
                    found += 1;
                  }

                  resolve();
                });
              })
          )
        );

        if (ignore) return;

        if (found === 0) {
          setStatus("fallback");
          return;
        }

        if (found === 1) {
          map.setCenter(bounds.getSouthWest());
          map.setLevel(5);
        } else {
          drawRoadRoutePolyline(kakao, map, roadPath);
          roadPath.forEach((point) => bounds.extend(point));
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
  }, [appKey, canUseKakao, markers, routePath]);

  if (status === "fallback") {
    return <FallbackAddressMap mapClassName={mapClassName} markers={markers} routePath={routePath} showList={showList} />;
  }

  return (
    <div className="space-y-4">
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-muted`}>
        <div ref={mapRef} className="h-full w-full" />
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

function drawRoadRoutePolyline(kakao: any, map: any, roadPath: any[]) {
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
  const toneClass =
    marker.tone === "origin"
      ? "background:#111827;color:#ffffff;"
      : marker.tone === "lead"
        ? "background:#059669;color:#ffffff;"
        : "background:#2563eb;color:#ffffff;";
  const label = escapeHtml(marker.label);
  const name = escapeHtml(marker.name);

  return `
    <div style="${toneClass}border-radius:8px;padding:7px 9px;box-shadow:0 8px 18px rgba(15,23,42,.22);font-size:12px;font-weight:800;white-space:nowrap;">
      ${label} · ${name}
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function FallbackAddressMap({ mapClassName = defaultMapClassName, markers, routePath, showList }: KakaoAddressMapProps) {
  return (
    <div className="space-y-4">
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-[linear-gradient(135deg,#eef7f2_0%,#eef7f2_34%,#f8fafc_34%,#f8fafc_45%,#edf2ff_45%,#edf2ff_100%)]`}>
        <div className="absolute left-[8%] top-[18%] h-[2px] w-[80%] rotate-12 bg-white shadow-sm" />
        <div className="absolute left-[20%] top-[70%] h-[2px] w-[68%] -rotate-12 bg-white shadow-sm" />
        <div className="absolute left-[52%] top-[8%] h-[82%] w-[2px] rotate-6 bg-white shadow-sm" />
        <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-2 text-xs font-bold text-muted-foreground shadow-sm">
          {routePath?.length ? "카카오맵 키 확인 후 실제 도로 경로가 표시됩니다." : "방문 후보 위치 샘플 화면"}
        </div>
        {markers.map((marker) => (
          <div
            key={`${marker.label}-${marker.address}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
          >
            <span
              className={`flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-white px-2 text-xs font-black text-white shadow-lg ${
                marker.tone === "origin" ? "bg-slate-950" : marker.tone === "lead" ? "bg-emerald-600" : "bg-primary"
              }`}
            >
              {marker.label}
            </span>
            <div className="pointer-events-none absolute left-1/2 top-10 z-10 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-white p-3 text-xs shadow-lg group-hover:block">
              <p className="font-black">{marker.name}</p>
              <p className="mt-1 leading-5 text-muted-foreground">{marker.address}</p>
            </div>
          </div>
        ))}
      </div>
      {showList && <MarkerList markers={markers} />}
    </div>
  );
}

function MarkerList({ markers }: { readonly markers: ReadonlyArray<KakaoMapMarker> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {markers.map((marker) => (
        <div key={`${marker.label}-${marker.name}`} className="rounded-md border border-border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-black">{marker.name}</p>
            <Badge className={marker.tone === "origin" ? "bg-slate-950 text-white" : marker.tone === "lead" ? "bg-emerald-600 text-white" : ""}>
              {marker.tone === "origin" ? "출발지" : marker.tone === "lead" ? "신규" : "거래처"}
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
