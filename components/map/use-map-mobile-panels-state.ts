import { useState } from "react";

// 통계(KPI) 펼침과 모바일 지도 컨트롤·영업 지역 시트 열림 상태 묶음입니다(D-6 ⑤-8, 동작 변화 0).
export function useMapMobilePanelsState() {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [mobileMapControlsOpen, setMobileMapControlsOpen] = useState(false);
  const [mobileSalesAreaOpen, setMobileSalesAreaOpen] = useState(false);
  return {
    statsExpanded, setStatsExpanded,
    mobileMapControlsOpen, setMobileMapControlsOpen,
    mobileSalesAreaOpen, setMobileSalesAreaOpen
  };
}
