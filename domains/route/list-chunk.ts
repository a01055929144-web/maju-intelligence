// CC-48-3: 지도 목록 나눠 그리기. 처음엔 LIST_CHUNK줄만 그리고 "더 보기"로 늘린다. 선택한 줄이 아래쪽이면 거기까지는 항상 그린다(스크롤·강조 유지).
export const LIST_CHUNK = 100;

export function visibleCount(limit: number, total: number, selectedIndex: number) {
  return Math.min(total, Math.max(limit, selectedIndex + 1));
}
