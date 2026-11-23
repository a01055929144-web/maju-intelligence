import { useState } from "react";

// 지도 영업 지역 설정 여부와 칩 팝오버용 지역 라벨 상태 묶음입니다(D-6 ⑤-6, 동작 변화 0).
// 시안 ⑫: 영업 지역 칩 팝오버를 "내 영업 지역 / 영업 필요 지역"으로 묶기 위한 지역 라벨.
export function useMapSalesAreaState() {
  const [mapSalesRegionsConfigured, setMapSalesRegionsConfigured] = useState<boolean | null>(null);
  const [mapAssignedAreaLabels, setMapAssignedAreaLabels] = useState<string[]>([]);
  const [mapExpansionAreaLabels, setMapExpansionAreaLabels] = useState<string[]>([]);
  return {
    mapSalesRegionsConfigured, setMapSalesRegionsConfigured,
    mapAssignedAreaLabels, setMapAssignedAreaLabels,
    mapExpansionAreaLabels, setMapExpansionAreaLabels
  };
}
