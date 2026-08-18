"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type KakaoMapMarker = {
  readonly address: string;
  readonly grade?: "A" | "B" | "C";
  readonly id?: string;
  readonly label: string;
  readonly markerColor?: string;
  readonly name: string;
  readonly tone: "customer" | "lead" | "origin" | "unregistered";
  readonly x: number;
  readonly y: number;
};

export type KakaoRoutePoint = {
  readonly lat: number;
  readonly lng: number;
};

// "신규 리드 반경"처럼 특정 중심점 주위 반경을 지도 위에 원으로 시각화하고, 원 가장자리의 손잡이를
// 네이버·카카오 지도처럼 드래그해서 반경을 직접 조절할 수 있게 합니다. centerMarkerId를 주면 이미
// 지오코딩된 마커 좌표(markerPositionsRef)를 중심으로 쓰고, 주지 않으면(예: "전체 거래처" 기준)
// 현재 지도 중심을 기준으로 씁니다.
export type KakaoRadiusOverlay = {
  readonly centerMarkerId?: string;
  readonly onRadiusChange?: (radiusMeters: number) => void;
  readonly radiusMeters: number;
};

type KakaoAddressMapProps = {
  readonly controlsOffsetClassName?: string;
  readonly controlsOffsetPx?: number;
  readonly fallbackReason?: string;
  readonly focusedMarkerId?: string;
  readonly mapClassName?: string;
  readonly markers: ReadonlyArray<KakaoMapMarker>;
  readonly onMarkerClick?: (marker: KakaoMapMarker) => void;
  readonly radiusOverlay?: KakaoRadiusOverlay;
  readonly routePath?: ReadonlyArray<KakaoRoutePoint>;
  readonly showList?: boolean;
};

type FullscreenMapPayload = {
  focusedMarkerId?: string;
  markers: ReadonlyArray<KakaoMapMarker>;
  routePath: ReadonlyArray<KakaoRoutePoint>;
};

declare global {
  interface Window {
    kakao?: any;
  }
}

let kakaoScriptPromise: Promise<void> | null = null;
const emptyRoutePath: ReadonlyArray<KakaoRoutePoint> = [];
const defaultMapClassName = "h-[360px]";
const kakaoSdkTimeoutMs = 5000;
const kakaoGeocodeTimeoutMs = 4500;

export function KakaoAddressMap({
  controlsOffsetClassName,
  controlsOffsetPx,
  focusedMarkerId,
  mapClassName = defaultMapClassName,
  markers,
  onMarkerClick,
  radiusOverlay,
  routePath = emptyRoutePath,
  showList = true
}: KakaoAddressMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const boundsRef = useRef<any>(null);
  // marker.id -> 지오코딩된 LatLng 캐시. 마커를 선택(focusedMarkerId 변경)할 때마다 지도를
  // 통째로 다시 만들고 모든 주소를 재지오코딩하면(과거 버그) 마커가 많을수록 브라우저가 몇 초씩
  // 멈추는 현상이 생깁니다. 최초 로드 때 한 번만 계산해 여기 저장해두고, 이후 포커스 이동은
  // 이 캐시를 읽어 지도만 살짝 이동시키는 훨씬 가벼운 두 번째 effect에서 처리합니다.
  const markerPositionsRef = useRef<Map<string, any>>(new Map());
  // onMarkerClick은 부모(sales-route-map-workspace.tsx)에서 매 렌더마다 새로 만들어지는 인라인
  // 함수일 수 있습니다. 이 값을 boot effect의 의존성 배열에 그대로 두면 부모가 리렌더될 때마다
  // (마커 클릭과 무관하게) 지도가 통째로 재생성됩니다. ref로 최신 콜백만 따로 추적해 boot effect가
  // 이 값 변화에 반응하지 않도록 분리합니다.
  const onMarkerClickRef = useRef(onMarkerClick);
  const radiusCircleRef = useRef<any>(null);
  const radiusHandleMarkerRef = useRef<any>(null);
  const radiusOnChangeRef = useRef(radiusOverlay?.onRadiusChange);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [fallbackReason, setFallbackReason] = useState("");
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const canUseKakao = useMemo(() => Boolean(appKey && appKey !== "replace-with-kakao-javascript-key"), [appKey]);
  // 부모(sales-route-map-workspace.tsx)는 markers를 렌더마다 새 배열/새 객체로 다시 만듭니다.
  // 이 원본 배열을 boot effect·반경 effect의 의존성으로 그대로 쓰면, 실제 마커 구성은 그대로인데
  // 배열 참조만 바뀐 리렌더(다른 화면의 주기적 새로고침 등)마다 지도 전체가 다시 만들어지고 모든
  // 주소가 재지오코딩되며, 그 끝에 항상 실행되는 "전체 마커에 맞추기(map.setBounds)"가 사용자가
  // 막 확대했던 화면이나 반경 원 화면을 계속 원래대로 되돌리는 문제가 있었습니다. 실제 내용이
  // 같으면 같은 값을 내는 문자열 키로 바꿔, 마커 구성이 진짜로 바뀔 때만 재생성되게 합니다.
  const markersSignature = useMemo(
    () => markers.map((marker) => `${marker.id || ""}|${marker.name || ""}|${marker.address || ""}|${marker.tone || ""}`).join(";;"),
    [markers]
  );

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    let ignore = false;

    async function bootMap() {
      setStatus("loading");
      setFallbackReason("");

      if (!canUseKakao || !mapRef.current) {
        setFallbackReason(`카카오맵 JavaScript 키가 현재 배포 런타임에 없습니다. Vercel Production에 NEXT_PUBLIC_KAKAO_MAP_APP_KEY를 다시 등록하고 재배포하세요.${getKakaoDomainHint()}`);
        setStatus("fallback");
        return;
      }

      try {
        await withTimeout(loadKakaoMapSdk(appKey!), kakaoSdkTimeoutMs, "Kakao map SDK load timed out");
        if (ignore || !mapRef.current || !window.kakao?.maps) return;
        mapRef.current.innerHTML = "";

        const kakao = window.kakao;
        const initialCenter = new kakao.maps.LatLng(37.5388, 127.2124);
        const map = new kakao.maps.Map(mapRef.current, {
          center: initialCenter,
          level: 8
        });
        mapInstanceRef.current = map;
        window.setTimeout(() => map.relayout?.(), 0);
        setStatus("ready");

        const geocoder = new kakao.maps.services.Geocoder();
        const bounds = new kakao.maps.LatLngBounds();
        boundsRef.current = bounds;
        markerPositionsRef.current = new Map();
        let focusedPosition: any = null;
        let found = 0;
        const roadPathSegments = splitRoutePath(routePath).map((segment) => segment.map((point) => new kakao.maps.LatLng(point.lat, point.lng)));
        const hasRoadPath = roadPathSegments.some((segment) => segment.length >= 2);

        await Promise.all(
          markers.map(
            (marker) =>
              withTimeout(
                new Promise<void>((resolve) => {
                geocoder.addressSearch(marker.address, (result: any[], geocodeStatus: string) => {
                  if (ignore) {
                    resolve();
                    return;
                  }

                  if (geocodeStatus === kakao.maps.services.Status.OK && result[0]) {
                    const position = new kakao.maps.LatLng(Number(result[0].y), Number(result[0].x));
                    const overlayContent = createMarkerOverlay(marker);
                    overlayContent.addEventListener("click", () => onMarkerClickRef.current?.(marker));
                    new kakao.maps.CustomOverlay({
                      content: overlayContent,
                      map,
                      position,
                      yAnchor: 1.75
                    });

                    bounds.extend(position);
                    found += 1;
                    if (marker.id) markerPositionsRef.current.set(marker.id, position);
                    if (focusedMarkerId && marker.id === focusedMarkerId) {
                      focusedPosition = position;
                    }
                  }

                  resolve();
                });
                }),
                kakaoGeocodeTimeoutMs,
                "Kakao address search timed out"
              ).catch(() => undefined)
          )
        );

        if (ignore) return;

        if (found === 0 && !hasRoadPath) {
          setFallbackReason(`카카오 주소 좌표 변환에 성공한 매장이 없습니다. 주소 형식 또는 Kakao JavaScript 도메인 등록을 확인하세요.${getKakaoDomainHint()}`);
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

        window.setTimeout(() => {
          map.relayout?.();
          if (hasRoadPath || found > 1) map.setBounds(bounds);
          if (!hasRoadPath && focusedPosition) {
            map.setCenter(focusedPosition);
            map.setLevel(5);
          }
        }, 120);
      } catch (error) {
        if (!ignore) {
          const message = error instanceof Error ? error.message : "카카오맵 로딩에 실패했습니다.";
          setFallbackReason(`${message}${getKakaoDomainHint()}`);
          setStatus("fallback");
        }
      }
    }

    bootMap();

    return () => {
      ignore = true;
    };
    // focusedMarkerId·onMarkerClick은 의도적으로 제외합니다 — 마커 선택/부모 리렌더마다 지도
    // 전체를 재생성하고 모든 주소를 재지오코딩하면(과거 버그, 실제로 몇 초 이상 브라우저가
    // 멈추는 현상을 유발) 안 되기 때문입니다. 포커스 이동은 아래의 가벼운 effect가 캐시된
    // 좌표로만 처리하고, 클릭 콜백은 onMarkerClickRef로 최신 값을 유지합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, canUseKakao, markersSignature, routePath]);

  // 마커 선택(focusedMarkerId 변경)은 지도를 다시 만들지 않고, 최초 로드 때 이미 지오코딩해
  // 캐시해둔 좌표로 지도만 살짝 이동시킵니다 — 이게 없으면 마커 클릭마다 위 boot effect 전체가
  // 다시 돌면서 모든 마커를 재지오코딩해 브라우저가 멈추는 원인이 됩니다.
  useEffect(() => {
    if (status !== "ready" || !focusedMarkerId) return;
    const map = mapInstanceRef.current;
    const position = markerPositionsRef.current.get(focusedMarkerId);
    if (!map || !position) return;
    map.setCenter(position);
    map.setLevel(5);
  }, [focusedMarkerId, status]);

  useEffect(() => {
    radiusOnChangeRef.current = radiusOverlay?.onRadiusChange;
  }, [radiusOverlay?.onRadiusChange]);

  // "신규 리드 반경" 원 시각화 + 드래그 손잡이. 매번 지도를 다시 만들지 않고(위 boot effect와
  // 분리) 원과 손잡이 마커만 독립적으로 그리고 지웁니다. centerMarkerId가 있으면 이미
  // 지오코딩된 좌표를, 없으면(전체 거래처 기준) 현재 지도 중심을 원의 중심으로 씁니다.
  useEffect(() => {
    radiusCircleRef.current?.setMap(null);
    radiusHandleMarkerRef.current?.setMap(null);
    radiusCircleRef.current = null;
    radiusHandleMarkerRef.current = null;

    const kakao = window.kakao;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !radiusOverlay || !kakao?.maps || !map) return;

    const centerPosition = radiusOverlay.centerMarkerId
      ? markerPositionsRef.current.get(radiusOverlay.centerMarkerId)
      : map.getCenter();
    if (!centerPosition) return;

    const centerLat = centerPosition.getLat();
    const centerLng = centerPosition.getLng();

    const circle = new kakao.maps.Circle({
      center: centerPosition,
      fillColor: "#14b8a6",
      fillOpacity: 0.12,
      radius: radiusOverlay.radiusMeters,
      strokeColor: "#0f766e",
      strokeOpacity: 0.85,
      strokeStyle: "solid",
      strokeWeight: 2
    });
    circle.setMap(map);
    radiusCircleRef.current = circle;

    // 반경이 넓으면(기본 5km) 지도가 이미 그 반경보다 훨씬 좁게 확대돼 있어 원과 손잡이가 화면
    // 밖으로 나가 "드래그할 게 안 보인다"는 문제가 있었습니다. 원이 처음 나타나거나 반경 값이
    // 바뀔 때마다 원 전체가 화면에 들어오도록 지도를 자동으로 맞춥니다.
    if (typeof circle.getBounds === "function") {
      map.setBounds(circle.getBounds(), 40, 40, 40, 40);
    }

    const handlePoint = destinationPoint(centerLat, centerLng, radiusOverlay.radiusMeters, 90);
    // 기본 마커 이미지(가는 핀 모양)는 원 가장자리에 있어도 "드래그 가능한 손잡이"로 보이지
    // 않아 사용자가 마우스로 반경을 조절할 수 있다는 걸 알아채지 못했습니다. 눈에 띄는 흰색
    // 원형 손잡이 아이콘으로 바꿔 드래그 가능한 컨트롤임을 시각적으로 분명히 합니다.
    const handleImage = new kakao.maps.MarkerImage(
      "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="10" fill="#ffffff" stroke="#0f766e" stroke-width="3"/><circle cx="13" cy="13" r="3.5" fill="#0f766e"/></svg>'
        ),
      new kakao.maps.Size(26, 26),
      { offset: new kakao.maps.Point(13, 13) }
    );
    const handleMarker = new kakao.maps.Marker({
      draggable: true,
      image: handleImage,
      position: new kakao.maps.LatLng(handlePoint.lat, handlePoint.lng),
      title: "드래그해서 반경 조절",
      zIndex: 10
    });
    handleMarker.setMap(map);
    radiusHandleMarkerRef.current = handleMarker;

    kakao.maps.event.addListener(handleMarker, "drag", () => {
      const pos = handleMarker.getPosition();
      const meters = haversineMeters(centerLat, centerLng, pos.getLat(), pos.getLng());
      circle.setRadius(Math.max(meters, 100));
    });
    kakao.maps.event.addListener(handleMarker, "dragend", () => {
      const pos = handleMarker.getPosition();
      const meters = haversineMeters(centerLat, centerLng, pos.getLat(), pos.getLng());
      radiusOnChangeRef.current?.(Math.max(meters, 100));
    });

    return () => {
      circle.setMap(null);
      handleMarker.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, radiusOverlay?.centerMarkerId, radiusOverlay?.radiusMeters, markersSignature]);

  // 카카오맵은 초기화 시점의 컨테이너 크기를 기준으로 캔버스를 그리기 때문에, 사이드 패널 접힘/펼침,
  // 팝업 표시, 반응형 브레이크포인트 전환처럼 지도 영역 자체의 높이·너비가 나중에 바뀌면 위쪽에 빈
  // 여백이 남는 등 타일이 실제 컨테이너 크기에 맞춰 다시 그려지지 않습니다. 컨테이너 크기 변화를 계속
  // 감시하다가 바뀔 때마다 relayout()을 호출해 이 문제를 근본적으로 막습니다.
  useEffect(() => {
    const container = mapRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      mapInstanceRef.current?.relayout?.();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  if (status === "fallback") {
    return (
      <FallbackAddressMap
        controlsOffsetPx={controlsOffsetPx}
        fallbackReason={fallbackReason}
        focusedMarkerId={focusedMarkerId}
        mapClassName={mapClassName}
        markers={markers}
        onMarkerClick={onMarkerClick}
        routePath={routePath}
        showList={showList}
      />
    );
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

  const wrapperClassName = showList ? "space-y-4" : "h-full w-full";

  return (
    <div className={wrapperClassName}>
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-muted`}>
        <div ref={mapRef} className="h-full w-full" />
        <MapControls
          offsetClassName={controlsOffsetClassName}
          offsetPx={controlsOffsetPx}
          onLocation={moveToCurrentLocation}
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
  offsetClassName,
  offsetPx,
  onLocation
}: {
  readonly offsetClassName?: string;
  readonly offsetPx?: number;
  readonly onLocation: () => void;
}) {
  // 모바일에서는 검색·필터 바가 지도 위 일반 흐름(in-flow)에 있어 지도 자체가 그 아래에서
  // 시작하므로 작은 고정값(top-3= 0.75rem)이면 충분합니다. xl 이상에서는 그 바가 지도 위에 뜨는
  // 카드(xl:absolute)로 바뀌는데, "신규 리드 반경"처럼 줄이 늘어나면 카드 높이가 달라집니다 —
  // offsetPx로 그 카드의 실제 렌더 높이를 CSS 변수로 넘겨받아 xl에서만 그 아래로 밀어내고,
  // offsetPx가 없으면(다른 화면들) 항상 top-3 그대로 사용합니다. offsetClassName은 가로 위치
  // (예: 우측 패널 접힘 여부에 따른 right-*)처럼 top과 무관한 값만 추가로 얹는 용도입니다.
  //
  // "전체 보기"·"전체화면 지도" 버튼은 2026-08-19 제거했습니다 — 상단 툴바에 이미 워크스페이스
  // 전체를 확대하는 "전체 화면" 버튼이 있어 기능이 겹쳤고, 사용자 피드백에 따라 모서리에는
  // "내 위치" 하나만 남겨 단순하게 정리했습니다.
  const style = offsetPx !== undefined ? ({ "--maju-map-controls-top": `${offsetPx}px` } as CSSProperties) : undefined;

  return (
    <div
      className={`absolute right-3 z-20 flex max-w-[calc(100%-24px)] items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur top-3 ${
        offsetPx !== undefined ? "xl:top-[var(--maju-map-controls-top)]" : ""
      } ${offsetClassName || ""}`}
      style={style}
    >
      <button aria-label="내 위치" title="내 위치" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100" onClick={onLocation} type="button">
        <Crosshair className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function openPopup(url: string, name: string) {
  window.open(url, name, "popup=yes,width=1440,height=920,left=80,top=40,noopener,noreferrer");
}

function openInternalLargeMap(payload: FullscreenMapPayload) {
  const mapId = `maju-map-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(mapId, JSON.stringify(payload));
  } catch {
    // If browser storage is blocked, the fullscreen page will show an empty-state message.
  }
  openPopup(`/map/fullscreen?mapId=${encodeURIComponent(mapId)}`, "maju-internal-large-map");
}

function getKakaoDomainHint() {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const host = window.location.hostname;
  if (host === "maju-intelligence.vercel.app" || host === "localhost") return "";
  if (host.endsWith(".vercel.app")) {
    return ` Kakao Developers > 플랫폼 > Web 사이트 도메인에 ${origin}도 함께 등록해야 합니다.`;
  }
  return "";
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

const EARTH_RADIUS_METERS = 6371000;

// 두 좌표 사이 직선거리(m) — 반경 손잡이를 드래그한 위치가 중심에서 얼마나 떨어졌는지 계산합니다.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 중심 좌표에서 특정 방위각(도, 0=북쪽·90=동쪽)으로 distanceMeters만큼 떨어진 좌표를 계산합니다 —
// 반경 원의 가장자리에 드래그 손잡이를 배치하는 데 씁니다.
function destinationPoint(lat: number, lng: number, distanceMeters: number, bearingDeg: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
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
      if (window.kakao?.maps && !window.kakao.maps.services) {
        existingScript.remove();
        delete window.kakao;
      } else if (window.kakao?.maps) {
        waitForKakaoServices(resolve, reject);
        return;
      } else {
        existingScript.addEventListener("load", () => waitForKakaoServices(resolve, reject), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Kakao map SDK load failed")), { once: true });
        return;
      }
    }

    const script = document.createElement("script");
    script.id = "kakao-map-sdk";
    script.async = true;
    script.defer = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
    script.onload = () => waitForKakaoServices(resolve, reject);
    script.onerror = () => reject(new Error("Kakao map SDK load failed"));
    document.head.appendChild(script);
  }).catch((error) => {
    kakaoScriptPromise = null;
    throw error;
  });

  return kakaoScriptPromise;
}

function waitForKakaoServices(resolve: () => void, reject: (error: Error) => void) {
  if (!window.kakao?.maps) {
    reject(new Error("Kakao map SDK object is unavailable"));
    return;
  }

  window.kakao.maps.load(() => {
    if (!window.kakao?.maps?.services) {
      kakaoScriptPromise = null;
      reject(new Error("Kakao map services library is unavailable"));
      return;
    }
    resolve();
  });
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

  // 아직 거래처로 등록하지 않은, 검색으로 찾은 매장입니다. 클릭하면 그 자리에서 바로 등록할 수 있도록
  // 점선 테두리의 "+" 배지로 눈에 띄게 구분해, 확정된 거래처 마커와 헷갈리지 않게 합니다.
  if (marker.tone === "unregistered") {
    return htmlToElement(`
      <button type="button" title="${name} · 미등록 매장 (클릭해서 등록)" style="cursor:pointer;background:#ffffff;color:#b45309;border:2px dashed #f59e0b;border-radius:999px;display:flex;align-items:center;gap:5px;padding:5px 9px;box-shadow:0 8px 18px rgba(245,158,11,.30);font-size:11px;font-weight:900;white-space:nowrap;">
        <span style="width:14px;height:14px;shrink:0;border-radius:999px;background:#f59e0b;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;">+</span>
        ${name}
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
  controlsOffsetPx,
  fallbackReason,
  focusedMarkerId,
  mapClassName = defaultMapClassName,
  markers,
  onMarkerClick,
  routePath,
  showList
}: KakaoAddressMapProps) {
  const focusedMarker = markers.find((marker) => marker.id === focusedMarkerId);
  const displayMarkers = focusedMarker?.id ? prioritizeFocusedMarker(markers, focusedMarker.id) : markers;
  const wrapperClassName = showList ? "space-y-4" : "h-full w-full";

  return (
    <div className={wrapperClassName}>
      <div className={`relative ${mapClassName} overflow-hidden rounded-md border border-border bg-[linear-gradient(135deg,#eef7f2_0%,#eef7f2_34%,#f8fafc_34%,#f8fafc_45%,#edf2ff_45%,#edf2ff_100%)]`}>
        <div className="absolute right-3 z-30 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur" style={{ top: controlsOffsetPx !== undefined ? `${controlsOffsetPx}px` : "0.75rem" }}>
          <button
            aria-label="전체화면 지도"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800"
            onClick={() => openInternalLargeMap({ focusedMarkerId, markers, routePath: routePath || emptyRoutePath })}
            title="전체화면 지도"
            type="button"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-2 text-xs font-bold text-muted-foreground shadow-sm">
          {fallbackReason || (routePath?.length ? "카카오맵 로딩 후 티맵 도로 경로가 표시됩니다." : "지도 좌표를 불러오지 못해 마커 위치만 표시합니다.")}
        </div>
        {fallbackReason ? (
          <div className="absolute left-1/2 top-1/2 z-20 w-[min(520px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-amber-200 bg-white/95 p-4 shadow-xl">
            <p className="text-sm font-black text-slate-950">지도 연결 확인 필요</p>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{fallbackReason}</p>
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-900">
              현재 배포 URL이 바뀌면 Vercel Production 환경변수와 Kakao Developers Web 도메인을 함께 맞춰야 실제 지도가 표시됩니다.
            </p>
          </div>
        ) : null}
        {!displayMarkers.length ? (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div className="rounded-md border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="font-black text-slate-900">표시할 지도 데이터가 없습니다.</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">거래처 주소를 먼저 등록하거나 고객사 데이터 기준 진단을 확인하세요.</p>
            </div>
          </div>
        ) : null}
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
                        ? "bg-teal-600"
                        : marker.tone === "unregistered"
                          ? "bg-amber-500"
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
                        ? "bg-teal-700 text-white"
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
