// CC-M5(45-3d): 리드 마커 묶음(클러스터) + 화면 밖 마커 거르기. 순수 함수 — 카카오 SDK·React를 모른다. 거래처는 묶지 않는다(호출하는 쪽이 리드만 넘긴다).
export type MarkerPoint = { readonly id: string; readonly lat: number; readonly lng: number };
export type MapViewBox = { readonly north: number; readonly south: number; readonly east: number; readonly west: number };
export type MarkerCluster = { readonly ids: readonly string[]; readonly lat: number; readonly lng: number };
export type MarkerPlan = { readonly clusters: MarkerCluster[]; readonly single: Set<string> };

/** 리드가 이 수 이하면 묶지 않는다(작은 지도는 지금처럼 전부 그림). */
export const CLUSTER_MIN_POINTS = 120;
/** 이 확대 단계(카카오 level, 클수록 멀리) 이상에서만 묶는다. */
export const CLUSTER_MIN_LEVEL = 5;
const VIEW_PADDING = 0.25;

/** 한 칸의 크기(도). 대략 화면 60px — 카카오 level이 1 오를 때마다 두 배. */
export function clusterCellDegrees(level: number) {
  return 0.0005 * 2 ** (level - 1);
}

/**
 * 화면(여백 25%) 안의 점만 남기고, 같은 칸에 2개 이상이면 한 묶음으로 만든다. keepIds(선택·강조한 마커)는 묶음에서 빼 항상 낱개로 둔다.
 * 화면 밖 점은 결과에 없다(그리지 않는다). 묶음 위치는 칸 안 점들의 평균.
 */
export function planMarkers(points: readonly MarkerPoint[], level: number, view: MapViewBox, keepIds: ReadonlySet<string> = new Set()): MarkerPlan {
  const latPad = (view.north - view.south) * VIEW_PADDING;
  const lngPad = (view.east - view.west) * VIEW_PADDING;
  const inView = points.filter((p) => p.lat <= view.north + latPad && p.lat >= view.south - latPad && p.lng <= view.east + lngPad && p.lng >= view.west - lngPad);
  const single = new Set<string>();
  if (points.length <= CLUSTER_MIN_POINTS || level < CLUSTER_MIN_LEVEL) {
    inView.forEach((p) => single.add(p.id));
    return { clusters: [], single };
  }
  const cell = clusterCellDegrees(level);
  const groups = new Map<string, MarkerPoint[]>();
  for (const p of inView) {
    if (keepIds.has(p.id)) { single.add(p.id); continue; }
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const group = groups.get(key);
    if (group) group.push(p); else groups.set(key, [p]);
  }
  const clusters: MarkerCluster[] = [];
  groups.forEach((group) => {
    if (group.length === 1) { single.add(group[0].id); return; }
    clusters.push({
      ids: group.map((p) => p.id),
      lat: group.reduce((sum, p) => sum + p.lat, 0) / group.length,
      lng: group.reduce((sum, p) => sum + p.lng, 0) / group.length
    });
  });
  return { clusters, single };
}
