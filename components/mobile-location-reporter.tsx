"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Crosshair, RefreshCw } from "lucide-react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { evaluateStaffLocation, getStaffLocationPostIntervalMs, type StaffLocationPoint } from "@/lib/staff-location";

type MobileLocationReporterProps = {
  readonly autoStart?: boolean;
  readonly currentCustomerId?: string;
  readonly currentCustomerName?: string;
  readonly deliveryVehicle?: string;
};

type LocationState = "idle" | "ready" | "blocked" | "error";
type NativeLocationBridge = {
  startWork(input: { consentVersion: string; deviceToken: string; startedAt: string }): Promise<{ started: true }>;
  stopWork(reason: "manual" | "logout" | "auto_12h"): Promise<{ stopped: true }>;
};

declare global { interface Window { MAJUNativeLocation?: NativeLocationBridge } }

// 2026-09-07 피드백("속도는 빠를수록 좋은 거야"): 대표 화면의 "접속" 표시가 최대한 빨리
// 갱신되도록, 기사 앱이 위치를 서버에 올리는 최소 간격을 15초에서 8초로 단축했습니다.
const LOCATION_QUEUE_STORAGE_KEY = "maju:mobile-location-queue:v1";
const LOCATION_WORK_STORAGE_KEY = "maju:mobile-location-work:v1";
const MAX_WORK_MS = 12 * 60 * 60 * 1000;
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
  workActive: boolean;
};

export function MobileLocationReporter({ autoStart = false, currentCustomerId, currentCustomerName, deliveryVehicle }: MobileLocationReporterProps) {
  const [state, setState] = useState<LocationState>("idle");
  const [detail, setDetail] = useState("");
  const [lastSentAt, setLastSentAt] = useState("");
  const [lastAccuracyMeters, setLastAccuracyMeters] = useState<number | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [workStartedAt, setWorkStartedAt] = useState(0);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const lastPostAtRef = useRef(0);
  const lastContextPostKeyRef = useRef("");
  const latestPositionRef = useRef<GeolocationPosition | null>(null);
  const previousPointRef = useRef<StaffLocationPoint | undefined>(undefined);
  const latestContextRef = useRef({ currentCustomerId, currentCustomerName, deliveryVehicle });
  const nativeStartedRef = useRef(false);

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

  const flushQueuedLocations = useCallback((): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    if (typeof window === "undefined" || navigator.onLine === false) return Promise.resolve();

    const task = (async () => {
      const remaining = [...readLocationQueue()];
      if (!remaining.length) {
        setQueuedCount(0);
        return;
      }
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
        throw error;
      }
    })();

    flushPromiseRef.current = task;
    void task
      .finally(() => {
        if (flushPromiseRef.current === task) flushPromiseRef.current = null;
      })
      .catch(() => undefined);
    return task;
  }, [sendPayload]);

  const postPosition = useCallback(
    (position: GeolocationPosition, force = false, status: LocationPostStatus = "active") => {
      const now = Date.now();
      const point = { accuracyMeters: position.coords.accuracy, lat: position.coords.latitude, lng: position.coords.longitude, recordedAt: new Date(position.timestamp || now).toISOString() };
      const decision = evaluateStaffLocation(point, previousPointRef.current);
      const isMoving = decision.accept && decision.distanceMeters >= 15;
      if (!force && now - lastPostAtRef.current < getStaffLocationPostIntervalMs(isMoving)) return;
      const mayBypassFilter = status === "paused" || status === "offline";
      if (!mayBypassFilter && !decision.accept && decision.reason !== "stationary") {
        if (decision.reason === "inaccurate" && !previousPointRef.current) setDetail("정확한 위치를 켜 주세요. 현재 위치는 부정확합니다.");
        return;
      }
      lastPostAtRef.current = now;
      if (decision.accept) previousPointRef.current = point;
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
        status,
        workActive: status !== "offline"
      };

      const sendCurrentPosition = async () => {
        // 과거 대기 좌표를 먼저 시간순으로 저장해야 이전 좌표가 현재 위치를 덮지 않습니다.
        if (status === "active") await flushQueuedLocations();
        await sendPayload(payload);
      };

      sendCurrentPosition()
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
    const saved = Number(window.localStorage.getItem(LOCATION_WORK_STORAGE_KEY) || 0);
    if (saved > 0 && Date.now() - saved < MAX_WORK_MS) setWorkStartedAt(saved);
    else if (autoStart) {
      const startedAt = Date.now();
      window.localStorage.setItem(LOCATION_WORK_STORAGE_KEY, String(startedAt));
      setWorkStartedAt(startedAt);
    } else window.localStorage.removeItem(LOCATION_WORK_STORAGE_KEY);
  }, [autoStart]);

  useEffect(() => {
    if (!workStartedAt) return;
    if (window.MAJUNativeLocation) {
      if (!nativeStartedRef.current) {
        nativeStartedRef.current = true;
        void fetch("/api/staff/location/device-token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consentVersion: "location-work-v1", deviceLabel: navigator.userAgent })
        }).then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.token) throw new Error(payload?.error || "앱 위치 인증에 실패했습니다.");
          await window.MAJUNativeLocation?.startWork({ consentVersion: "location-work-v1", deviceToken: payload.token, startedAt: new Date(workStartedAt).toISOString() });
          setState("ready"); setDetail("");
        }).catch((error) => { nativeStartedRef.current = false; setState("error"); setDetail(error instanceof Error ? error.message : "앱 위치 시작에 실패했습니다."); });
      }
      return;
    }
    if (!("geolocation" in navigator)) {
      setDetail("이 브라우저는 위치 공유를 지원하지 않습니다.");
      setState("blocked");
      return;
    }

    refreshQueuedCount();
    setIsOnline(navigator.onLine);
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
    const handleOnline = async () => {
      setIsOnline(true);
      setDetail("인터넷이 다시 연결되어 대기 위치를 전송하고 있습니다.");
      await flushQueuedLocations();
      requestCurrentPosition(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setDetail("오프라인입니다. 위치는 대기열에 저장됩니다.");
      setState("error");
    };
    const handlePageExit = () => { if (latestPositionRef.current) postPosition(latestPositionRef.current, true, "paused"); };
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
  }, [flushQueuedLocations, postPosition, refreshQueuedCount, requestCurrentPosition, workStartedAt]);

  useEffect(() => {
    if (!workStartedAt) return;
    const remaining = Math.max(0, MAX_WORK_MS - (Date.now() - workStartedAt));
    const timer = window.setTimeout(() => {
      if (window.MAJUNativeLocation) {
        void window.MAJUNativeLocation.stopWork("auto_12h");
        nativeStartedRef.current = false;
      }
      window.localStorage.removeItem(LOCATION_WORK_STORAGE_KEY);
      setWorkStartedAt(0);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [workStartedAt]);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const contextKey = `${currentCustomerId || ""}:${deliveryVehicle || ""}`;
    if (contextKey === lastContextPostKeyRef.current) return;
    lastContextPostKeyRef.current = contextKey;
    requestCurrentPosition(true);
  }, [currentCustomerId, deliveryVehicle, requestCurrentPosition]);

  const label =
    !isOnline
      ? "오프라인 · 위치 보관 중"
      : state === "ready"
      ? lastSentAt
        ? `위치 공유 ${lastSentAt}`
        : "위치 공유 중"
      : state === "blocked"
        ? "위치 권한 필요"
        : state === "error"
          ? "위치 저장 대기"
          : "위치 확인 중";

  const needsAction = state === "blocked" || state === "error";
  const workActive = workStartedAt > 0;

  const toggleWork = () => {
    if (workActive) {
      if (window.MAJUNativeLocation) {
        void window.MAJUNativeLocation.stopWork("manual").finally(() => {
          nativeStartedRef.current = false;
          void fetch("/api/staff/location/device-token", { method: "DELETE" });
        });
      }
      if (latestPositionRef.current) postPosition(latestPositionRef.current, true, "offline");
      window.localStorage.removeItem(LOCATION_WORK_STORAGE_KEY);
      setWorkStartedAt(0);
      return;
    }
    const startedAt = Date.now();
    window.localStorage.setItem(LOCATION_WORK_STORAGE_KEY, String(startedAt));
    setWorkStartedAt(startedAt);
  };

  return (
    <div
      className={`mt-2 max-w-full rounded-xl border px-3 py-2 text-xs font-semibold ${
        needsAction ? "border-amber-200 bg-amber-50 text-amber-800" : "border-teal-100 bg-white/90 text-teal-800"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {needsAction ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <Crosshair className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{currentCustomerName ? `${label} · ${currentCustomerName}` : label}</span>
        {needsAction ? (
          <button
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-white px-2 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"
            onClick={() => { if (isOnline) requestCurrentPosition(true); }}
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
            {!isOnline ? "연결 대기" : state === "blocked" ? "권한 재요청" : "지금 전송"}
          </button>
        ) : null}
      </div>
      <button className={`mt-2 min-h-11 w-full rounded-lg px-3 text-xs font-black ${workActive ? "bg-slate-900 text-white" : "bg-teal-600 text-white"}`} onClick={toggleWork} type="button">
        {workActive ? "근무 중 · 종료" : "근무 시작"}
      </button>
      {!workActive ? <p className="mt-1 text-xs text-slate-600">근무를 시작해야 위치가 공유됩니다. 12시간 뒤 자동 종료됩니다.</p> : null}
      {needsAction ? (
        <p aria-live="polite" className="mt-1 text-xs font-medium leading-5 text-amber-700">
          {detail || "브라우저 위치 권한과 로그인 상태를 확인하세요."}
          {queuedCount > 0 ? ` · 전송 대기 ${queuedCount.toLocaleString()}건은 휴대폰에 보관 중입니다.` : ""}
        </p>
      ) : null}
      {!needsAction && (lastAccuracyMeters !== null || queuedCount > 0) ? (
        <p className="mt-1 truncate text-xs font-medium text-teal-700/80">
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
