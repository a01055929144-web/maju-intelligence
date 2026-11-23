import { useEffect, useRef } from "react";

import { normalizeStoredMapPanelMode } from "@/lib/map-preferences";
import type { MapPanelMode } from "@/components/map/map-layer-controls";
import type { WorkspaceView } from "@/components/map/route-planner";

// 지도 화면 상태(담당자·상세·패널·미리보기 카드)와 주소(URL)·뒤로가기 동기화 묶음입니다(D-6 ⑤-2b, 동작 변화 0).
// 두 번째 effect는 최초 1회만 등록되므로 setter 인자는 첫 렌더 값이 쓰입니다(원래 코드와 같음).
type Options = {
  initialView: WorkspaceView;
  mapPanelMode: MapPanelMode;
  panelModeStorageKey: string;
  previewLeadId: string;
  previewStoreId: string;
  selectedId: string;
  setActiveView: (view: WorkspaceView) => void;
  setMapFocusId: (id: string) => void;
  setMapPanelMode: (mode: MapPanelMode) => void;
  setPreviewLeadId: (id: string) => void;
  setPreviewStoreId: (id: string) => void;
  setSelectedId: (id: string) => void;
  setSelectedLiveVehicleId: (id: string) => void;
  setVehicleFilterId: (id: string) => void;
  vehicleFilterId: string;
};

export function useMapHistorySync({
  initialView,
  mapPanelMode,
  panelModeStorageKey,
  previewLeadId,
  previewStoreId,
  selectedId,
  setActiveView,
  setMapFocusId,
  setMapPanelMode,
  setPreviewLeadId,
  setPreviewStoreId,
  setSelectedId,
  setSelectedLiveVehicleId,
  setVehicleFilterId,
  vehicleFilterId
}: Options) {
  // 2026-10-25: 담당자 선택·거래처 상세를 주소(URL)에 남겨 브라우저/휴대폰 뒤로가기로 이전 화면에 돌아오게 합니다.
  // 상태 → 주소 동기화는 값이 실제로 달라졌을 때만 pushState하므로, 뒤로가기로 돌아온 직후에는 다시 쌓이지 않습니다.
  const historySyncMountedRef = useRef(false);
  const detailHistoryPushedRef = useRef(false);
  // 패널(3분할·담당자·거래처·신규·영업·지도만)과 지도 위 미리보기 카드도 뒤로가기로 되돌립니다.
  const panelBaselineRef = useRef<MapPanelMode | null>(null);
  const lastSyncedPanelRef = useRef<MapPanelMode>(mapPanelMode);
  useEffect(() => {
    if (typeof window === "undefined" || initialView === "leads") return;
    if (!historySyncMountedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    // 상세를 닫을 때, 방금 상세를 열면서 쌓은 기록이면 새 기록을 쌓지 않고 한 칸 뒤로 갑니다.
    // (닫은 뒤 뒤로가기를 누르면 상세가 다시 열리는 혼란 방지)
    if (!selectedId && params.has("detail") && detailHistoryPushedRef.current) {
      detailHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    if (vehicleFilterId !== "all") params.set("staff", vehicleFilterId);
    else params.delete("staff");
    if (selectedId) params.set("detail", selectedId);
    else params.delete("detail");
    if (panelBaselineRef.current === null && mapPanelMode !== lastSyncedPanelRef.current && !params.has("panel")) {
      panelBaselineRef.current = lastSyncedPanelRef.current;
    }
    if (panelBaselineRef.current !== null && mapPanelMode !== panelBaselineRef.current) params.set("panel", mapPanelMode);
    else params.delete("panel");
    lastSyncedPanelRef.current = mapPanelMode;
    const hadPin = params.has("pin");
    const pin = previewStoreId ? `s:${previewStoreId}` : previewLeadId ? `l:${previewLeadId}` : "";
    if (pin) params.set("pin", pin);
    else params.delete("pin");
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      // 미리보기 카드끼리 바꿀 때는 기록을 늘리지 않습니다(뒤로가기 한 번이면 카드가 닫힘).
      const onlyPinChanged = hadPin && Boolean(pin) && next.replace(/[?&]pin=[^&#]*/, "") === current.replace(/[?&]pin=[^&#]*/, "");
      if (onlyPinChanged) window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
      detailHistoryPushedRef.current = Boolean(selectedId);
    }
  }, [initialView, mapPanelMode, previewLeadId, previewStoreId, selectedId, vehicleFilterId]);
  useEffect(() => {
    if (typeof window === "undefined" || initialView === "leads") return;
    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      detailHistoryPushedRef.current = false;
      const view = params.get("view");
      setActiveView(view === "customers" || view === "course" || view === "history" ? view : "map");
      setVehicleFilterId(params.get("staff") || "all");
      setSelectedId(params.get("detail") || "");
      setSelectedLiveVehicleId("");
      const pin = params.get("pin") || "";
      setPreviewStoreId(pin.startsWith("s:") ? pin.slice(2) : "");
      setPreviewLeadId(pin.startsWith("l:") ? pin.slice(2) : "");
      setMapFocusId("");
      const panel = params.get("panel");
      const panelModes: MapPanelMode[] = ["split", "driver", "customer", "newLead", "salesLead", "map"];
      if (panel && panelModes.includes(panel as MapPanelMode)) {
        lastSyncedPanelRef.current = panel as MapPanelMode;
        setMapPanelMode(panel as MapPanelMode);
      } else if (panelBaselineRef.current) {
        lastSyncedPanelRef.current = panelBaselineRef.current;
        setMapPanelMode(panelBaselineRef.current);
      }
    };
    // 저장된 패널 모드 복원(위쪽 effect)이 첫 기록으로 쌓이지 않도록 기준값을 맞춥니다.
    try {
      const savedMode = normalizeStoredMapPanelMode(window.localStorage.getItem(panelModeStorageKey));
      if (savedMode) lastSyncedPanelRef.current = savedMode;
    } catch {
      // 저장소 차단 시 기본값 유지
    }
    applyFromLocation();
    historySyncMountedRef.current = true;
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
    // 최초 1회만 등록합니다. setState 함수는 안정적이라 의존성에서 뺍니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);
}
