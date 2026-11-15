// CC-M7(45-3f): 두 좌표 사이 직선거리(haversine)의 지도 쪽 한 곳. 지도 파일(kakao-address-map)이 쓴다.
// shortcut: lib/route-map-utils(haversineKm)·domains/delivery/staff-location·components/delivery-history-view의 같은 식은 소유 밖이라 그대로 — 각 담당이 이쪽으로 모을 때 같이 정리.
const EARTH_RADIUS_METERS = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1000;
}
