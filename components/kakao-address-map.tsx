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
  // 기거래처 근접 리드 표시(2026-08-24 피드백: "기거래처 주변의 리드들은 별도의 뱃지가 있으면
  // 가독성이 좋을 것 같네") — tone: "lead" 마커에만 의미가 있습니다.
  readonly nearAnchor?: boolean;
  readonly name: string;
  readonly tone: "customer" | "lead" | "origin" | "unregistered";
  readonly x: number;
  readonly y: number;
};

export type KakaoRoutePoint = {
  readonly lat: number;
  readonly lng: number;
};

// "신규 리드 서치"처럼 특정 중심점 주위 반경을 지도 위에 원으로 시각화하고, 원 가장자리의 손잡이를
// 네이버·카카오 지도처럼 드래그해서 반경을 직접 조절할 수 있게 합니다. centerPoint를 주면 그 좌표를,
// centerMarkerId를 주면 이미 지오코딩된 마커 좌표(markerPositionsRef)를 중심으로 쓰고, 둘 다 없으면
// (예: "전체 거래처" 기준) 현재 지도 중심을 기준으로 씁니다. onClear가 있으면 손잡이 옆 말풍선에
// 네이버 지도 반경 도구처럼 "지우기" 버튼이 함께 뜹니다.
export type KakaoRadiusOverlay = {
  readonly centerMarkerId?: string;
  readonly centerPoint?: { lat: number; lng: number };
  readonly onClear?: () => void;
  readonly onRadiusChange?: (radiusMeters: number) => void;
  readonly radiusMeters: number;
};

// "신규 리드 서치"의 지도 클릭 인터랙션입니다(네이버 지도 반경 도구 참고). active가 true인 동안
// 지도를 왼쪽 클릭하면 그 지점에 고정 기본값(0.5km) 반경으로 즉시 원을 만들고 onLocked로 알립니다 —
// 이후 크기 조절은 radiusOverlay의 드래그 손잡이가 맡습니다. 지도를 오른쪽 클릭하면 현재 표시 중인
// radiusOverlay를 지웁니다(onClear).
export type KakaoLeadSearchInteraction = {
  readonly active: boolean;
  readonly defaultRadiusMeters?: number;
  readonly onLocked: (point: { lat: number; lng: number }, radiusMeters: number) => void;
};

type KakaoAddressMapProps = {
  readonly controlsOffsetClassName?: string;
  readonly controlsOffsetPx?: number;
  readonly fallbackReason?: string;
  readonly focusedMarkerId?: string;
  readonly leadSearch?: KakaoLeadSearchInteraction;
  readonly mapClassName?: string;
  readonly markers: ReadonlyArray<KakaoMapMarker>;
  readonly onCenterChange?: (point: { lat: number; lng: number }) => void;
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

// 2026-08-24 피드백: "전반적으로 속도가 더뎌, 빠른 속도가 중요할 것 같아". 지도를 열 때마다 모든
// 거래처·리드 주소를 매번 카카오 API로 다시 지오코딩하고 있었는데, 주소가 늘어날수록(거래처가
// 늘어날수록) 이게 가장 큰 병목이었습니다. 주소의 좌표는 사실상 바뀌지 않으므로, 한 번 조회한
// 결과는 메모리(같은 탭에서 재사용)와 localStorage(새로고침·재방문에도 유지)에 남겨두고, 다음부터는
// API를 다시 호출하지 않고 캐시에서 바로 꺼내 씁니다.
const GEOCODE_CACHE_STORAGE_KEY = "maju:kakao-geocode-cache:v1";
const GEOCODE_CACHE_MAX_ENTRIES = 3000;
const geocodeMemoryCache = new Map<string, { lat: number; lng: number }>();
let geocodeStorageLoaded = false;

function loadGeocodeCacheFromStorage() {
  if (geocodeStorageLoaded || typeof window === "undefined") return;
  geocodeStorageLoaded = true;
  try {
    const raw = window.localStorage.getItem(GEOCODE_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number }>;
    Object.entries(parsed).forEach(([address, point]) => {
      if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) geocodeMemoryCache.set(address, point);
    });
  } catch {
    // 캐시 파싱에 실패해도 치명적이지 않습니다 — 그냥 다시 지오코딩하면 됩니다.
  }
}

function saveGeocodeCacheToStorage() {
  if (typeof window === "undefined") return;
  try {
    // 캐시가 무한정 커지지 않도록 최근 항목 위주로만 저장합니다.
    const entries = Array.from(geocodeMemoryCache.entries()).slice(-GEOCODE_CACHE_MAX_ENTRIES);
    window.localStorage.setItem(GEOCODE_CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage 용량 초과 등은 무시합니다 — 캐시는 있으면 좋고 없어도 동작에는 지장 없습니다.
  }
}

export function KakaoAddressMap({
  controlsOffsetClassName,
  controlsOffsetPx,
  focusedMarkerId,
  leadSearch,
  mapClassName = defaultMapClassName,
  markers,
  onCenterChange,
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
  // 신규 리드 마커만 확대/축소 수준에 따라 "이름표 있는 알약" ↔ "작은 점"으로 다시 그립니다(2026-08-24
  // 피드백: "신규 거래처명 이렇게 뜨게 끔 만들어" — 예전 겹침 문제 때문에 항상 점으로 축약했던 걸,
  // 지도를 확대(level 낮음)했을 때는 화면에 보이는 개수가 자연히 줄어드니 이름표를 다시 보여주도록
  // 절충). CustomOverlay.setContent()로 좌표 재지오코딩 없이 내용만 바꿔 가볍게 유지합니다.
  const leadOverlayEntriesRef = useRef<Array<{ element: HTMLElement; marker: KakaoMapMarker; overlay: any }>>([]);
  // marker.id -> 현재 화면에 붙어 있는 마커 DOM(button) 엘리먼트. 선택된 거래처/리드가 지도에서도
  // 눈에 띄도록(2026-08-30 피드백: "선택한 거래처 지도에서도 하이라이트 되면 좋을듯") focusedMarkerId가
  // 바뀔 때 이 엘리먼트에 직접 outline/scale을 입혔다 지웠다 합니다 — 재지오코딩 없이 가벼운 DOM 조작만.
  const markerElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  // 방금까지 하이라이트해 둔 엘리먼트를 기억해뒀다가, focusedMarkerId가 바뀌면 그 엘리먼트에서만
  // 하이라이트 스타일을 지웁니다(전체를 순회할 필요 없이 O(1)).
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  // onMarkerClick은 부모(sales-route-map-workspace.tsx)에서 매 렌더마다 새로 만들어지는 인라인
  // 함수일 수 있습니다. 이 값을 boot effect의 의존성 배열에 그대로 두면 부모가 리렌더될 때마다
  // (마커 클릭과 무관하게) 지도가 통째로 재생성됩니다. ref로 최신 콜백만 따로 추적해 boot effect가
  // 이 값 변화에 반응하지 않도록 분리합니다.
  const onMarkerClickRef = useRef(onMarkerClick);
  const radiusCircleRef = useRef<any>(null);
  const radiusHandleMarkerRef = useRef<any>(null);
  const radiusLabelOverlayRef = useRef<any>(null);
  const radiusOnChangeRef = useRef(radiusOverlay?.onRadiusChange);
  const radiusOnClearRef = useRef(radiusOverlay?.onClear);
  // radiusOverlay가 지금 화면에 떠 있는지(centerPoint/centerMarkerId가 있는지)를 ref로도 들고 있어,
  // 지도 우클릭(clear) 핸들러가 리렌더를 기다리지 않고 항상 최신 상태를 읽을 수 있게 합니다.
  const radiusActiveRef = useRef(Boolean(radiusOverlay?.centerPoint || radiusOverlay?.centerMarkerId));
  // "신규 리드 서치" 클릭 인터랙션(네이버 지도 반경 도구 참고) — active/onLocked 콜백만 ref로
  // 최신값을 추적합니다. 부모가 매 렌더마다 새 함수를 넘겨도 boot effect를 다시 돌리지 않기 위함입니다.
  const leadSearchRef = useRef(leadSearch);
  const onCenterChangeRef = useRef(onCenterChange);
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
    leadSearchRef.current = leadSearch;
  }, [leadSearch]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    radiusOnClearRef.current = radiusOverlay?.onClear;
    radiusActiveRef.current = Boolean(radiusOverlay?.centerPoint || radiusOverlay?.centerMarkerId);
  }, [radiusOverlay?.onClear, radiusOverlay?.centerPoint, radiusOverlay?.centerMarkerId]);

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

        // "신규 리드 서치"(네이버 지도 반경 도구 참고): active일 때 지도를 왼쪽 클릭하면 그 지점에
        // 고정 기본 반경(기본 500m)으로 즉시 원을 만들고 onLocked로 부모에 알립니다. 이후 크기
        // 조절은 아래 radiusOverlay effect의 드래그 손잡이가 맡습니다.
        kakao.maps.event.addListener(map, "click", (mouseEvent: any) => {
          if (!leadSearchRef.current?.active) return;
          const clickLatLng = mouseEvent.latLng;
          if (!clickLatLng) return;
          leadSearchRef.current.onLocked(
            { lat: clickLatLng.getLat(), lng: clickLatLng.getLng() },
            leadSearchRef.current.defaultRadiusMeters || 500
          );
        });

        // 오른쪽 클릭으로 현재 표시 중인 반경 원을 지웁니다(네이버 지도 반경 도구의 "지우기"와 동일한
        // 동작을 오른쪽 클릭에도 매핑) — radiusActiveRef가 true일 때만(원이 떠 있을 때만) 반응합니다.
        kakao.maps.event.addListener(map, "rightclick", () => {
          if (radiusActiveRef.current) radiusOnClearRef.current?.();
        });

        // 지도 중심이 바뀔 때(초기 로드·드래그·확대축소 끝)마다 알려, 부모가 "현재 지도 중심에서
        // 검색" 같은 빠른 선택(프리셋 반경 칩)에 쓸 수 있게 합니다. 드래그 도중 매 프레임이 아니라
        // idle(움직임이 끝났을 때)에만 쏘아 가볍게 유지합니다.
        kakao.maps.event.addListener(map, "idle", () => {
          const center = map.getCenter?.();
          if (center) onCenterChangeRef.current?.({ lat: center.getLat(), lng: center.getLng() });
        });

        const geocoder = new kakao.maps.services.Geocoder();
        const bounds = new kakao.maps.LatLngBounds();
        boundsRef.current = bounds;
        markerPositionsRef.current = new Map();
        markerElementsRef.current = new Map();
        highlightedElementRef.current = null;
        leadOverlayEntriesRef.current = [];
        let focusedPosition: any = null;
        let found = 0;
        const roadPathSegments = splitRoutePath(routePath).map((segment) => segment.map((point) => new kakao.maps.LatLng(point.lat, point.lng)));
        const hasRoadPath = roadPathSegments.some((segment) => segment.length >= 2);

        // 신규 리드 마커가 한 번에 많이 뜨면 상호명이 적힌 넓은 알약형 라벨끼리 서로 겹쳐 지도가
        // 읽기 어려워집니다(2026-08-24 피드백: "카드가 겹쳐지고 있어서 가독성이 떨어지는 게 있어").
        // 하지만 항상 점으로만 축약하면 반대로 "신규 거래처명이 안 보인다"는 피드백이 나옵니다.
        // 그래서 확대/축소 수준(level, 낮을수록 확대)에 따라 동적으로 전환합니다 — 지도를 확대하면
        // 같은 화면에 보이는 마커 수가 자연히 줄어드니 그때는 이름표를 보여주고, 축소해서 한 화면에
        // 많이 몰릴 때만 점으로 축약합니다. 리드 전체 개수(leadMarkerCount)는 전국 기준이라 몇백
        // 건이어도 화면에 다 보이는 게 아니므로 줌 판단에 그대로 쓰면 안 됩니다 — 아주 극단적으로
        // 많을 때만(800개 초과) 확대해도 항상 점으로 유지하는 안전장치로 두고, 평소에는 줌 레벨만
        // 봅니다.
        const leadMarkerCount = markers.filter((marker) => marker.tone === "lead").length;
        const computeCompactLeadMarkers = (level: number) => leadMarkerCount > 800 || level >= 7;
        let compactLeadMarkers = computeCompactLeadMarkers(map.getLevel());

        const attachLeadOverlayEntry = (overlay: any, marker: KakaoMapMarker, element: HTMLElement) => {
          leadOverlayEntriesRef.current.push({ element, marker, overlay });
        };

        // 2026-08-24 피드백: "전반적으로 속도가 더뎌, 빠른 속도가 중요할 것 같아" — 캐시에 이미 있는
        // 주소는 API 호출 없이 바로 마커를 그리고, 처음 보는 주소만 실제로 지오코딩합니다.
        loadGeocodeCacheFromStorage();
        let geocodeCacheMissCount = 0;

        const placeMarkerAtPosition = (marker: KakaoMapMarker, lat: number, lng: number) => {
          const position = new kakao.maps.LatLng(lat, lng);
          const overlayContent = createMarkerOverlay(marker, marker.tone === "lead" && compactLeadMarkers);
          overlayContent.addEventListener("click", () => onMarkerClickRef.current?.(marker));
          const overlay = new kakao.maps.CustomOverlay({
            content: overlayContent,
            map,
            position,
            yAnchor: 1.75
          });
          if (marker.tone === "lead") attachLeadOverlayEntry(overlay, marker, overlayContent);

          bounds.extend(position);
          found += 1;
          if (marker.id) {
            markerPositionsRef.current.set(marker.id, position);
            markerElementsRef.current.set(marker.id, overlayContent);
          }
          if (focusedMarkerId && marker.id === focusedMarkerId) {
            focusedPosition = position;
          }
        };

        await Promise.all(
          markers.map((marker) => {
            const cachedPoint = geocodeMemoryCache.get(marker.address);
            if (cachedPoint) {
              if (!ignore) placeMarkerAtPosition(marker, cachedPoint.lat, cachedPoint.lng);
              return Promise.resolve();
            }

            geocodeCacheMissCount += 1;
            return withTimeout(
              new Promise<void>((resolve) => {
                geocoder.addressSearch(marker.address, (result: any[], geocodeStatus: string) => {
                  if (ignore) {
                    resolve();
                    return;
                  }

                  if (geocodeStatus === kakao.maps.services.Status.OK && result[0]) {
                    const lat = Number(result[0].y);
                    const lng = Number(result[0].x);
                    geocodeMemoryCache.set(marker.address, { lat, lng });
                    placeMarkerAtPosition(marker, lat, lng);
                  }

                  resolve();
                });
              }),
              kakaoGeocodeTimeoutMs,
              "Kakao address search timed out"
            ).catch(() => undefined);
          })
        );

        if (geocodeCacheMissCount > 0) saveGeocodeCacheToStorage();

        // 확대/축소가 끝날 때마다(idle) 리드 마커만 다시 그립니다 — 좌표는 이미 지오코딩해 캐시된
        // CustomOverlay 그대로 두고 setContent()로 내용만 바꾸므로 재지오코딩 없이 가볍습니다.
        kakao.maps.event.addListener(map, "zoom_changed", () => {
          const nextCompact = computeCompactLeadMarkers(map.getLevel());
          if (nextCompact === compactLeadMarkers) return;
          compactLeadMarkers = nextCompact;
          leadOverlayEntriesRef.current = leadOverlayEntriesRef.current.map((entry) => {
            const nextElement = createMarkerOverlay(entry.marker, compactLeadMarkers);
            nextElement.addEventListener("click", () => onMarkerClickRef.current?.(entry.marker));
            entry.overlay.setContent(nextElement);
            if (entry.marker.id) markerElementsRef.current.set(entry.marker.id, nextElement);
            return { ...entry, element: nextElement };
          });
        });

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
    if (status !== "ready") return;
    if (highlightedElementRef.current) {
      highlightedElementRef.current.style.outline = "";
      highlightedElementRef.current.style.outlineOffset = "";
      highlightedElementRef.current.style.transform = "";
      highlightedElementRef.current.style.zIndex = "";
      highlightedElementRef.current = null;
    }
    if (!focusedMarkerId) return;
    const map = mapInstanceRef.current;
    const position = markerPositionsRef.current.get(focusedMarkerId);
    if (map && position) {
      map.setCenter(position);
      map.setLevel(5);
    }
    const focusedElement = markerElementsRef.current.get(focusedMarkerId);
    if (focusedElement) {
      focusedElement.style.outline = "3px solid #f43f5e";
      focusedElement.style.outlineOffset = "2px";
      focusedElement.style.transform = "scale(1.15)";
      focusedElement.style.zIndex = "30";
      highlightedElementRef.current = focusedElement;
    }
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
    radiusLabelOverlayRef.current?.setMap(null);
    radiusCircleRef.current = null;
    radiusHandleMarkerRef.current = null;
    radiusLabelOverlayRef.current = null;

    const kakao = window.kakao;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !radiusOverlay || !kakao?.maps || !map) return;

    const centerPosition = radiusOverlay.centerPoint
      ? new kakao.maps.LatLng(radiusOverlay.centerPoint.lat, radiusOverlay.centerPoint.lng)
      : radiusOverlay.centerMarkerId
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

    // 손잡이를 드래그하는 동안 반경 숫자를 바로 옆에 띄워, 놓기 전에 지금 얼마나 늘렸는지 바로
    // 볼 수 있게 합니다(네이버 지도 반경 도구의 "총반경 X.Xm" 말풍선 참고). "지우기" 버튼도 같은
    // 말풍선에 넣어 DOM 엘리먼트로 만들고, 드래그 중에는 텍스트 노드만 갱신해(재생성 없이) 버튼의
    // 클릭 리스너가 끊기지 않게 합니다.
    const { element: labelElement, textNode: labelTextNode } = createRadiusLabelElement(radiusOverlay.radiusMeters, radiusOverlay.onClear);
    const labelOverlay = new kakao.maps.CustomOverlay({
      content: labelElement,
      map,
      position: new kakao.maps.LatLng(handlePoint.lat, handlePoint.lng),
      yAnchor: 1.6,
      zIndex: 11
    });
    radiusLabelOverlayRef.current = labelOverlay;

    kakao.maps.event.addListener(handleMarker, "drag", () => {
      const pos = handleMarker.getPosition();
      const meters = Math.max(haversineMeters(centerLat, centerLng, pos.getLat(), pos.getLng()), 100);
      circle.setRadius(meters);
      labelOverlay.setPosition(pos);
      labelTextNode.textContent = radiusLabelText(meters);
    });
    kakao.maps.event.addListener(handleMarker, "dragend", () => {
      const pos = handleMarker.getPosition();
      const meters = Math.max(haversineMeters(centerLat, centerLng, pos.getLat(), pos.getLng()), 100);
      radiusOnChangeRef.current?.(meters);
    });

    return () => {
      circle.setMap(null);
      handleMarker.setMap(null);
      labelOverlay.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, radiusOverlay?.centerMarkerId, radiusOverlay?.centerPoint?.lat, radiusOverlay?.centerPoint?.lng, radiusOverlay?.radiusMeters, markersSignature]);

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

// 반경 손잡이 옆 말풍선에 쓰는 "총반경 X.Xm/X.Xkm" 텍스트입니다(네이버 지도 반경 도구 문구 참고).
function radiusLabelText(radiusMeters: number) {
  if (radiusMeters < 1000) return `총반경 ${Math.round(radiusMeters).toLocaleString()}m`;
  const km = radiusMeters / 1000;
  const formatted = km >= 10 ? Math.round(km).toString() : (Math.round(km * 10) / 10).toString();
  return `총반경 ${formatted}km`;
}

// 반경 손잡이 옆에 띄우는 말풍선 DOM 엘리먼트를 만듭니다 — 네이버 지도 반경 도구처럼 현재 반경
// 값과 "지우기" 버튼을 한 말풍선에 담습니다. 드래그 중에는 반환된 textNode.textContent만 갱신해
// 버튼 리스너가 끊기지 않게 합니다(CustomOverlay.setContent()로 통째로 교체하면 리스너가 사라짐).
function createRadiusLabelElement(radiusMeters: number, onClear?: () => void) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;align-items:center;gap:6px;background:#0f766e;color:#ffffff;border-radius:999px;padding:4px 6px 4px 10px;font-size:12px;font-weight:900;white-space:nowrap;box-shadow:0 6px 14px rgba(15,23,42,.25);";

  const textNode = document.createElement("span");
  textNode.textContent = radiusLabelText(radiusMeters);
  wrapper.appendChild(textNode);

  if (onClear) {
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.setAttribute("aria-label", "반경 지우기");
    clearButton.textContent = "✕";
    clearButton.style.cssText =
      "display:grid;place-items:center;width:18px;height:18px;border-radius:999px;background:rgba(255,255,255,.22);border:none;color:#ffffff;font-size:10px;cursor:pointer;line-height:1;padding:0;";
    clearButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onClear();
    });
    wrapper.appendChild(clearButton);
  }

  return { element: wrapper, textNode };
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

function createMarkerOverlay(marker: KakaoMapMarker, compactLead = false) {
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

  // 신규 리드 마커는 등급(A/B/C) 배지가 있어도 항상 상호명을 라벨에 함께 표시합니다 — 예전에는
  // 아래 marker.grade 분기를 먼저 타서 등급 배지 안에 "신규" 텍스트만 남고 상호명이 통째로
  // 빠지는 문제가 있었습니다(2026-08-24 피드백: "3번째 사진에 신규라고만 마커가 있어서").
  if (marker.tone === "lead") {
    // 기거래처 근접 리드는 마커 바깥에 청록(cyan) 헤일로(halo) 링을 둘러 눈에 띄게 합니다
    // (2026-08-24 피드백: "기거래처 주변의 리드들은 별도의 뱃지가 있으면 가독성이 좋을 것 같네").
    // 처음엔 테두리 색을 앰버로 바꾸는 방식이었는데, 마커 채우기 색(등급별 보라/파랑/회색/초록)과
    // 섞여 탁해 보인다는 피드백("색상 조합이 이쁘지 않음")을 받아 — 테두리는 항상 흰색으로 깔끔하게
    // 유지하고, 그 바깥에 별도 링(box-shadow)만 얹는 방식으로 바꿨습니다. 색도 다른 배지들(개업
    // 임박=로즈, 인스타=핑크, A등급=보라)과 안 겹치는 청록으로 골랐습니다.
    const nearAnchorHaloShadow = marker.nearAnchor ? "0 0 0 3px #0891b2," : "";
    const nearAnchorTitleSuffix = marker.nearAnchor ? " · 기거래처 인근" : "";
    if (compactLead) {
      return htmlToElement(`
        <button type="button" title="${label} · ${name}${nearAnchorTitleSuffix}" style="cursor:pointer;${toneClass}width:14px;height:14px;padding:0;border:2px solid #ffffff;border-radius:999px;box-shadow:${nearAnchorHaloShadow}0 4px 10px rgba(15,23,42,.32);"></button>
      `);
    }
    const gradeBadge = marker.grade
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:999px;background:rgba(255,255,255,.3);font-size:9px;margin-right:5px;flex-shrink:0;">${escapeHtml(marker.grade)}</span>`
      : "";
    // 뱃지는 알약의 채우기 색과 무관하게 항상 또렷이 보이도록 흰 배경 원 안에 청록색 별을 넣습니다
    // (기존엔 배경 없이 옅은 별만 있어 등급 배지처럼 색이 섞여 잘 안 보였습니다).
    const nearAnchorBadge = marker.nearAnchor
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:999px;background:#ffffff;color:#0891b2;font-size:9px;margin-right:4px;flex-shrink:0;">★</span>`
      : "";
    return htmlToElement(`
      <button type="button" title="${name}${nearAnchorTitleSuffix}" style="cursor:pointer;${toneClass}border:0;border-radius:8px;padding:6px 9px;box-shadow:0 8px 18px rgba(15,23,42,.22);font-size:11px;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;">
        ${nearAnchorBadge}${gradeBadge}${label} · ${name}
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
