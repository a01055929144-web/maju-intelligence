import { useState } from "react";

import type { NearbyPermitLeadResult } from "@/components/sales-route-map-workspace";

// 반경 리드 탐색 패널 상태 묶음입니다(D-6 ⑤-5, 동작 변화 0). 반경 기본값은 0.5km로 고정합니다(2026-08-20 피드백).
export const DEFAULT_LEAD_SEARCH_RADIUS_KM = 0.5;

export function useLeadRadiusState() {
  const [leadRadiusOpen, setLeadRadiusOpen] = useState(false);
  const [leadRadiusAnchorMode, setLeadRadiusAnchorMode] = useState<"all" | "customer" | "point">("point");
  const [leadRadiusCustomerId, setLeadRadiusCustomerId] = useState("");
  // point 모드에서 클릭으로 고정한 중심좌표입니다. 아직 고정 전이면 null이고, 이 값이 null인
  // 동안에만 지도 클릭이 "이 지점에 반경 만들기" 인터랙션을 받습니다.
  const [leadRadiusPoint, setLeadRadiusPoint] = useState<{ lat: number; lng: number } | null>(null);
  // 지도가 마지막으로 멈춘 중심좌표 — "빠른 반경 선택" 칩을 누르면 클릭 없이도 지금 보고 있는
  // 지도 중심을 기준으로 바로 탐색할 수 있게 합니다.
  const [mapCenterPoint, setMapCenterPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [leadRadiusKm, setLeadRadiusKm] = useState(DEFAULT_LEAD_SEARCH_RADIUS_KM);
  const [leadRadiusSearching, setLeadRadiusSearching] = useState(false);
  const [leadRadiusResult, setLeadRadiusResult] = useState<NearbyPermitLeadResult | null>(null);
  const [leadRadiusError, setLeadRadiusError] = useState("");
  return {
    leadRadiusOpen, setLeadRadiusOpen,
    leadRadiusAnchorMode, setLeadRadiusAnchorMode,
    leadRadiusCustomerId, setLeadRadiusCustomerId,
    leadRadiusPoint, setLeadRadiusPoint,
    mapCenterPoint, setMapCenterPoint,
    leadRadiusKm, setLeadRadiusKm,
    leadRadiusSearching, setLeadRadiusSearching,
    leadRadiusResult, setLeadRadiusResult,
    leadRadiusError, setLeadRadiusError
  };
}
