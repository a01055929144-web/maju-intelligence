import { useEffect, useRef, useState } from "react";

import { NOTICE_TOAST_MS } from "@/components/ui/notice";
import { getTmsServiceDateKey } from "@/domains/delivery/service-date";
import type { DeliveryCompletionEvent, StaffVehicleLocation } from "@/lib/store";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getStaffMapPollIntervalMs } from "@/lib/staff-location";

// 라이브 차량 위치·오늘 배송 완료 폴링과 "기사님이 접속했습니다" 알림 묶음입니다(D-6 ⑤-3, 동작 변화 0).
export function useLiveVehicleFeed({ churnRiskCompanyId, staffVehicleLocations }: { churnRiskCompanyId?: string; staffVehicleLocations: StaffVehicleLocation[] }) {
  const [liveVehicleLocations, setLiveVehicleLocations] = useState<StaffVehicleLocation[]>(staffVehicleLocations);
  const [liveVehicleConnectionError, setLiveVehicleConnectionError] = useState("");
  // 2026-09-07 피드백("배송이완료되면 완료가 표시되었으면 해") 대응: 오늘(최근 20시간) 안에 배송완료로
  // 기록된 거래처 id 목록입니다. 라이브 차량 위치와 같은 폴링 주기를 타도록 같은 요청에
  // completions=true를 얹어, 새 폴링을 따로 만들지 않고 한 번에 최신 상태를 받아옵니다.
  // (이 블록이 예전에 병합 과정에서 두 벌로 중복 선언돼 빌드가 깨졌던 것을 여기서 하나로 정리했습니다.)
  const [todayCompletions, setTodayCompletions] = useState<DeliveryCompletionEvent[]>([]);
  // 2026-09-07 피드백("모바일로 접속했는데 PC는 새로고침해야 불이 들어와 — 실시간 연동이 필요해,
  // 접속하면 아래에서 팝업이 뜨거나 화면이 조금 강하게 보여졌으면 좋겠어" + 후속 피드백 "속도는
  // 빠를수록 좋은 거야"): 폴링 주기를 15초→8초→4초로 줄여 체감 지연을 최소화했고(기사 앱의 위치
  // 전송 최소 간격도 함께 8초로 단축, mobile-location-reporter.tsx 참고), 이전 폴링에는 없던
  // 차량(기사)이 새로 나타나면 화면 하단에 "OOO 기사님이 접속했습니다" 배너를 몇 초간 띄워
  // 새로고침 없이도 바로 눈에 띄게 합니다.
  const knownVehicleIdsRef = useRef<Set<string> | null>(null);
  const hasRealtimeVehicleRef = useRef(staffVehicleLocations.some((location) => location.displayState === "realtime"));
  const [justConnectedVehicle, setJustConnectedVehicle] = useState<{ at: number; label: string } | null>(null);
  useEffect(() => {
    setLiveVehicleLocations(staffVehicleLocations);
  }, [staffVehicleLocations]);
  useEffect(() => {
    let cancelled = false;
    let toastTimer: number | undefined;
    const load = async () => {
      try {
        const params = new URLSearchParams({ completions: "true", date: getTmsServiceDateKey() });
        if (churnRiskCompanyId) params.set("companyId", churnRiskCompanyId);
        const response = await fetchWithTimeout(`/api/staff/location?${params.toString()}`, { cache: "no-store" }, 8000);
        const payload = (await response.json().catch(() => null)) as { completions?: DeliveryCompletionEvent[]; error?: string; locations?: StaffVehicleLocation[] } | null;
        if (!response.ok) throw new Error(payload?.error || "라이브 차량 위치를 불러오지 못했습니다.");
        if (!cancelled && response.ok && Array.isArray(payload?.locations)) {
          setLiveVehicleConnectionError("");
          setLiveVehicleLocations(payload.locations);
          hasRealtimeVehicleRef.current = payload.locations.some((location) => location.displayState === "realtime");
          const activeIds = new Set(payload.locations.filter((location) => !location.isStale).map((location) => location.id));
          const previousIds = knownVehicleIdsRef.current;
          // 첫 폴링(previousIds === null)에서는 이미 접속해 있던 차량까지 전부 "새로 접속"으로
          // 오탐하지 않도록 알림 없이 기준선만 세웁니다. 그다음 폴링부터 새로 나타난 차량만 알립니다.
          if (previousIds) {
            const newlyConnected = payload.locations.find((location) => !location.isStale && !previousIds.has(location.id));
            if (newlyConnected) {
              const label = newlyConnected.driverName || newlyConnected.deliveryVehicle || "기사";
              setJustConnectedVehicle({ at: Date.now(), label });
              if (toastTimer) window.clearTimeout(toastTimer);
              toastTimer = window.setTimeout(() => setJustConnectedVehicle(null), NOTICE_TOAST_MS);
            }
          }
          knownVehicleIdsRef.current = activeIds;
        }
        if (!cancelled && response.ok && Array.isArray(payload?.completions)) setTodayCompletions(payload.completions);
      } catch (error) {
        // 마지막 정상 좌표는 유지하되 통신 실패를 명확히 표시합니다. 다음 4초 폴링이 성공하면 자동 복구됩니다.
        if (!cancelled) setLiveVehicleConnectionError(error instanceof Error ? error.message : "라이브 차량 연결이 지연되고 있습니다.");
      }
    };
    void load();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let timer = window.setTimeout(function poll() {
      if (document.visibilityState === "visible") void load();
      timer = window.setTimeout(
        poll,
        getStaffMapPollIntervalMs(hasRealtimeVehicleRef.current)
      );
    }, getStaffMapPollIntervalMs(hasRealtimeVehicleRef.current));
    return () => {
      cancelled = true;
      if (toastTimer) window.clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearTimeout(timer);
    };
  }, [churnRiskCompanyId]);

  return { justConnectedVehicle, liveVehicleConnectionError, liveVehicleLocations, todayCompletions };
}
