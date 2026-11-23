import { useState } from "react";

import type { PermitLeadItem } from "@/lib/store";
import { useLatestRequest } from "@/hooks/use-latest-request";

// "전체 리드 보기" 표시 여부·목록·로딩 상태와 최신 요청 토큰 묶음입니다(D-6 ⑤-7, 동작 변화 0).
// 반경 검색과 무관하게 활성 신규 리드 전체를 메인 지도에 바로 표시합니다(2026-08-20 피드백).
// 시안 ⑫: 3분할 기본 화면은 오른쪽 "신규" 목록과 지도 리드 핀을 함께 보여줍니다.
export function useAllLeadsState() {
  const [showAllLeadsOnMap, setShowAllLeadsOnMap] = useState(true);
  const [allLeadsForMap, setAllLeadsForMap] = useState<PermitLeadItem[]>([]);
  const [allLeadsLoadState, setAllLeadsLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // M9: 같은 종류 요청은 마지막 것만 살린다(옛 응답이 새 목록을 덮지 않게).
  const beginAllLeadsRequest = useLatestRequest();
  return {
    showAllLeadsOnMap, setShowAllLeadsOnMap,
    allLeadsForMap, setAllLeadsForMap,
    allLeadsLoadState, setAllLeadsLoadState,
    beginAllLeadsRequest
  };
}
