// CC-59: "가는 길에 넣기" — 배송 경로(순서대로 놓인 정류장) 중 리드에서 가장 덜 돌아가는 자리를 찾는다. React·DB를 모른다.
export type RoutePoint = { readonly lat: number; readonly lng: number };
export type RouteSuggestion = { readonly insertAt: number; readonly extraMinutes: number; readonly nearStopOrder: number };

// shortcut: 직선거리 ÷ 평균 25km/h로 어림(도로 길이·막힘 모름). 실제 길찾기 API를 쓰게 되면 교체.
const AVERAGE_KMH = 25;

export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const minutes = (km: number) => (km / AVERAGE_KMH) * 60;

/**
 * stops: 좌표를 아는 정류장(stop_order 순). 돌아 가는 거리가 가장 짧은 사이(마지막 뒤 포함)에 넣을 자리와 추가 분(올림).
 * insertAt은 새 정류장이 갖게 될 stop_order. 정류장이 없으면 null.
 */
export function suggestInsertion(stops: ReadonlyArray<RoutePoint & { readonly order: number }>, lead: RoutePoint): RouteSuggestion | null {
  if (!stops.length) return null;
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  let best: { insertAt: number; km: number; nearStopOrder: number } | null = null;
  for (let i = 0; i <= sorted.length; i += 1) {
    const prev = sorted[i - 1], next = sorted[i];
    const km = prev && next ? distanceKm(prev, lead) + distanceKm(lead, next) - distanceKm(prev, next) : distanceKm((prev ?? next) as RoutePoint, lead);
    if (!best || km < best.km) best = { insertAt: prev ? prev.order + 1 : next.order, km, nearStopOrder: (prev ?? next).order };
  }
  return best ? { insertAt: best.insertAt, nearStopOrder: best.nearStopOrder, extraMinutes: Math.max(1, Math.ceil(minutes(best.km))) } : null;
}
