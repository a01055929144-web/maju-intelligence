// 지도 마커가 겹칠 때 위에 올 순서. 거래처가 리드보다 먼저 그려져 수천 개 리드 마커(같은 건물의 인허가 리드 포함)에
// 덮여 안 보이던 문제(11/14 대표 "거래처는 지도 마커가 안 보이네") — 차량 > 출발지 > 거래처 > 미등록 > 리드.
export type MarkerTone = "customer" | "lead" | "origin" | "unregistered" | "vehicle";

export function markerZIndex(tone: MarkerTone) {
  if (tone === "vehicle") return 9;
  if (tone === "origin") return 8;
  if (tone === "customer") return 7;
  if (tone === "unregistered") return 5;
  return 3;
}
