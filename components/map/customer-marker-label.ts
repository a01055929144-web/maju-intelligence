// CC-47-2b 거래처 마커 상호명 알약의 라벨 규칙(순수 함수 — 마커 HTML은 DOM이 필요해 단위 테스트가 안 돼서 규칙만 분리).
// label: 등급 보기 = 등급(A/B/C), 차량 보기 = 차량 번호("1") 또는 미배정("?"). markerColor는 차량 보기에서만 있다.
export type CustomerMarkerLabelInput = { readonly label: string; readonly markerColor?: string; readonly name: string; readonly displayName?: string };

/** 카카오 지도 level 7 이상(축소)이면 알약 대신 배지만 그린다. 거래처는 개수와 무관하게 level만 본다. */
export const isCompactCustomerLevel = (level: number) => level >= 7;

export function customerMarkerLabel(marker: CustomerMarkerLabelInput): { badge: string; title: string } {
  const shop = marker.displayName ?? marker.name;
  if (marker.label === "?") return { badge: "미", title: `미배정 · ${shop}` };
  if (marker.markerColor && /^\d+$/.test(marker.label)) return { badge: marker.label, title: `${marker.label}호차 · ${shop}` };
  return { badge: marker.label, title: shop };
}
