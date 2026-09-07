"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Crosshair, RefreshCw } from "lucide-react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type MobileLocationReporterProps = {
  readonly currentCustomerId?: string;
  readonly currentCustomerName?: string;
  readonly deliveryVehicle?: string;
};

type LocationState = "idle" | "ready" | "blocked" | "error";

const LOCATION_POST_INTERVAL_MS = 15_000;
const LOCATION_QUEUE_STORAGE_KEY = "maju:mobile-location-queue:v1";
const MAX_QUEUED_LOCATIONS = 20;
type LocationPostStatus = "active" | "offline" | "paused";

type LocationPayload = {
  accuracyMeters: number;
  currentCustomerId?: string;
  deliveryVehicle?: string;
  lat: number;
  lng: number;
  recordedAt: string;
  status: LocationPostStatus;
};

export function MobileLocationReporter({ currentCustomerId, currentCustomerName, deliveryVehicle }: MobileLocationReporterProps) {
  const [state, setState] = useState<LocationState>("idle");
  const [detail, setDetail] = useState("");
  const [lastSentAt, setLastSentAt] = useState("");
  const [lastAccuracyMeters, setLastAccuracyMeters] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const isFlushingRef = useRef(false);
  const lastPostAtRef = useRef(0);
  const lastContextPostKeyRef = useRef("");
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const latestContextRef = useRef({ currentCustomerId, currentCustomerName, deliveryVehicle });

  useEffect(() => {
    latestContextRef.current = { currentCustomerId, currentCustomerName, deliveryVehicle };
  }, [currentCustomerId, currentCustomerName, deliveryVehicle]);

  const refreshQueuedCount = useCallback(() => {
    setQueuedCount(readLocationQueue().length);
  }, []);

  const sendPayload = useCallback(async (payload: LocationPayload) => {
    const response = await fetchWithTimeout(
      "/api/staff/location",
      {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "POST"
      },
      8000
    );
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errorPayload?.error || "위치 저장에 실패했습니다.");
    }
  }, []);

  const flushQueuedLocations = useCallback(async () => {
    if (isFlushingRef.current || typeof window === "undefined" || navigator.onLine === false) return;
    const queue = readLocationQueue();
    if (!queue.length) {
      setQueuedCount(0);
      return;
    }
    isFlushingRef.current = true;
    const remaining = [...queue];
    try {
      while (remaining.length) {
        const payload = remaining[0];
        await sendPayload(payload);
        remaining.shift();
        writeLocationQueue(remaining);
        setQueuedCount(remaining.length);
      }
      setDetail("");
      setState("ready");
      setLastSentAt(formatLocationTime(new Date()));
    } catch (error) {
      writeLocationQueue(remaining);
      setQueuedCount(remaining.length);
      setDetail(error instanceof Error ? error.message : "저장 대기 중인 위치가 있습니다.");
      setState("error");
    } finally {
      isFlushingRef.current = false;
    }
  }, [sendPayload]);

  const postPosition = useCallback(
    (position: GeolocationPosition, force = false, status: LocationPostStatus = "active") => {
      const now = Date.now();
      if (!force && now - lastPostAtRef.current < LOCATION_POST_INTERVAL_MS) return;
      lastPostAtRef.current = now;
      latestPositionRef.current = position;
      const accuracyMeters = Math.round(position.coords.accuracy || 0);
      setLastAccuracyMeters(accuracyMeters);
      const { currentCustomerId: latestCustomerId, deliveryVehicle: latestVehicle } = latestContextRef.current;
      const payload: LocationPayload = {
        accuracyMeters,
        currentCustomerId: latestCustomerId,
        deliveryVehicle: latestVehicle,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        recordedAt: new Date().toISOString(),
        status
      };

      sendPayload(payload)
        .then(async () => {
          setDetail("");
          setState("ready");
          setLastSentAt(formatLocationTime(new Date()));
          await flushQueuedLocations();
        })
        .catch((error) => {
          enqueueLocationPayload(payload);
          refreshQueuedCount();
          if (status === "active") {
            setDetail(error instanceof Error ? error.message : "위치 저장에 실패했습니다.");
            setState("error");
          }
        });
    },
    [flushQueuedLocations, refreshQueuedCount, sendPayload]
  );

  const requestCurrentPosition = useCallback(
    (force = true) => {
      if (!("geolocation" in navigator)) {
        setDetail("이 브라우저는 위치 공유를 지원하지 않습니다.");
        setState("blocked");
        return;
      }
      setState((current) => (current === "ready" ? current : "idle"));
      navigator.geolocation.getCurrentPosition(
        (position) => postPosition(position, force),
        (error) => {
          setDetail(getGeolocationErrorMessage(error));
          setState("blocked");
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 }
      );
    },
    [postPosition]
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setDetail("이 브라우저는 위치 공유를 지원하지 않습니다.");
      setState("blocked");
      return;
    }

    refreshQueuedCount();
    const watchId = navigator.geolocation.watchPosition(
      (position) => postPosition(position),
      (error) => {
        setDetail(getGeolocationErrorMessage(error));
        setState("blocked");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
    requestCurrentPosition(true);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestCurrentPosition(true);
        return;
      }
      if (latestPositionRef.current) postPosition(latestPositionRef.current, true, "paused");
    };
    const handleFocus = () => requestCurrentPosition(true);
    const handleOnline = () => {
      flushQueuedLocations();
      requestCurrentPosition(true);
    };
    const handleOffline = () => {
      setDetail("오프라인입니다. 위치는 대기열에 저장됩니다.");
      setState("error");
    };
    const handlePageExit = () => {
      if (latestPositionRef.current) postPosition(latestPositionRef.current, true, "offline");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handleFocus);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);

    return () => {
      handlePageExit();
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handleFocus);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [flushQueuedLocations, postPosition, refreshQueuedCount, requestCurrentPosition]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const contextKey = `${currentCustomerId || ""}:${deliveryVehicle || ""}`;
    if (contextKey === lastContextPostKeyRef.current) return;
    lastContextPostKeyRef.current = contextKey;
    requestCurrentPosition(true);
  }, [currentCustomerId, deliveryVehicle, requestCurrentPosition]);

  const label =
    state === "ready"
      ? lastSentAt
        ? `위치 공유 ${lastSentAt}`
        : "위치 공유 중"
      : state === "blocked"
        ? "위치 권한 필요"
        : state === "error"
          ? "위치 저장 대기"
          : "위치 확인 중";

  const needsAction = state === "blocked" || state === "error";

  return (
    <div
      className={`mt-2 max-w-full rounded-xl border px-2.5 py-1.5 text-[11px] font-black ${
        needsAction ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-100 bg-white/90 text-teal-800"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {needsAction ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <Crosshair className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{currentCustomerName ? `${label} · ${currentCustomerName}` : label}</span>
        {needsAction ? (
          <button
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-white px-2 text-[10px] font-black text-amber-800 ring-1 ring-inset ring-amber-200"
            onClick={() => requestCurrentPosition(true)}
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
            재시도
          </button>
        ) : null}
      </div>
      {needsAction ? <p className="mt-1 truncate text-[10px] font-bold text-amber-700">{detail || "브라우저 위치 권한과 로그인 상태를 확인하세요."}</p> : null}
      {!needsAction && (lastAccuracyMeters !== null || queuedCount > 0) ? (
        <p className="mt-1 truncate text-[10px] font-bold text-teal-700/80">
          {lastAccuracyMeters !== null ? `오차 ${lastAccuracyMeters.toLocaleString()}m` : "오차 확인 중"}
          {queuedCount > 0 ? ` · 대기 ${queuedCount.toLocaleString()}건` : ""}
        </p>
      ) : null}
    </div>
  );
}

function enqueueLocationPayload(payload: LocationPayload) {
  const queue = readLocationQueue();
  const nextQueue = [...queue, payload].slice(-MAX_QUEUED_LOCATIONS);
  writeLocationQueue(nextQueue);
}

function readLocationQueue(): LocationPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCATION_QUEUE_STORAGE_KEY) || "[]") as LocationPayload[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
  } catch {
    return [];
  }
}

function writeLocationQueue(queue: LocationPayload[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCATION_QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED_LOCATIONS)));
}

function formatLocationTime(date: Date) {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "브라우저 위치 권한을 허용해야 합니다.";
  if (error.code === error.POSITION_UNAVAILABLE) return "현재 위치를 확인할 수 없습니다.";
  if (error.code === error.TIMEOUT) return "위치 확인 시간이 초과됐습니다.";
  return "브라우저 위치 권한과 로그인 상태를 확인하세요.";
}
