import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// 지도 위 검색·필터 카드(mapHeaderRef)와 지도 영역(mapAreaRef)의 실제 화면 위치 차이를 재서
// 좌우 패널·컨트롤 오프셋(mapHeaderHeightPx)을 계산하는 묶음입니다(D-6 ⑤-2, 동작 변화 0).
export function useMapHeaderOffset() {
  // 지도 탭에서 검색/필터/신규 리드 반경 바가 1024px 이상에서 지도 위 카드로 표시됩니다(lg:absolute).
  // "신규 리드 반경"을 켜면 이 카드에 한 줄이 더 늘어나 높이가 커지는데, 지도 오른쪽 위
  // MapControls(내 위치 버튼)의 세로 위치가 고정값이면 늘어난 카드와 겹칩니다.
  //
  // 이 카드(mapHeaderRef)는 위쪽 KPI/이탈 위험 알림 블록을 건너뛰고 항상 지도 영역의 부모
  // 기준 top-2에 뜨는데(lg:absolute), MapControls는 지도 영역 자신(mapAreaRef)의 top을
  // 기준으로 위치합니다 — 두 기준점이 서로 다른 조상이라, 카드 높이만으로 오프셋을 계산하면
  // KPI 패널이 펼쳐져 있거나 이탈 위험 알림 배너가 떠 있을 때 실제 카드 아래쪽 가장자리와
  // MapControls 위치가 어긋납니다. getBoundingClientRect()로 카드의 실제 화면 아래쪽 가장자리와
  // 지도 영역의 실제 화면 위쪽 가장자리를 직접 비교해 그 차이를 오프셋으로 써서, 위에 어떤 블록이
  // 얼마나 있든 항상 카드 바로 아래에 오도록 합니다.
  const mapHeaderRef = useRef<HTMLElement>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const [mapHeaderHeightPx, setMapHeaderHeightPx] = useState(0);
  const recomputeMapHeaderOffset = useCallback(() => {
    const headerNode = mapHeaderRef.current;
    const areaNode = mapAreaRef.current;
    if (!headerNode || !areaNode) return;
    const headerRect = headerNode.getBoundingClientRect();
    const areaRect = areaNode.getBoundingClientRect();
    // 시안 ⑫부터 필터 줄은 지도 위에 겹치지 않는 고정 줄입니다. 겹칠 때(예전 배치·특수 화면)만
    // 그만큼 + 여백을 주고, 겹치지 않으면 0이라 패널·컨트롤이 지도 영역 맨 위에 붙습니다.
    const overlap = headerRect.bottom - areaRect.top;
    setMapHeaderHeightPx(overlap > 1 ? Math.round(overlap + 16) : 0);
  }, []);
  useEffect(() => {
    const headerNode = mapHeaderRef.current;
    const areaNode = mapAreaRef.current;
    if (!headerNode || !areaNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recomputeMapHeaderOffset);
    observer.observe(headerNode);
    observer.observe(areaNode);
    recomputeMapHeaderOffset();
    // 2026-09-07 피드백("우측 패널 위쪽에 위치하는데 짤려서 안보임") 대응: ResizeObserver는 헤더
    // 카드(mapHeaderRef) 자신의 "크기"가 변할 때만 반응합니다. 그런데 이 오프셋 계산은 크기가 아니라
    // "화면상 실제 위치"(getBoundingClientRect)를 봅니다 — 창 크기 변경처럼 두 요소의 크기는 그대로여도
    // 화면 위치/레이아웃이 바뀌는 경우까지는 ResizeObserver가 못 잡아, 헤더 카드(z-20, 항상 위)가
    // 계산이 어긋난 채로 좌우 패널(z-10)의 위쪽을 가려버리는 문제가 있었습니다. window resize에도
    // 다시 계산하도록 보강합니다.
    window.addEventListener("resize", recomputeMapHeaderOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeMapHeaderOffset);
    };
  }, [recomputeMapHeaderOffset]);
  // 위 ResizeObserver/resize 리스너로도 놓칠 수 있는 나머지 경우(폰트 로딩으로 인한 리플로우,
  // 리드 필터 줄이 늘어나는 등rowspan 변화가 있는 렌더 등)를 보강하기 위해, 커밋될 때마다(매 렌더
  // 이후) 오프셋을 다시 계산합니다. recomputeMapHeaderOffset은 getBoundingClientRect 두 번 읽는 정도라
  // 가볍고, 값이 그대로면 setState가 리렌더를 유발하지 않아 무한 루프로 이어지지 않습니다.
  useLayoutEffect(() => {
    recomputeMapHeaderOffset();
  });

  return { mapAreaRef, mapHeaderHeightPx, mapHeaderRef, recomputeMapHeaderOffset };
}
