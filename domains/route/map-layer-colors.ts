// CC-48 48-1b 지도 색 기준 한 곳. 지도 마커·레이어 바·오른쪽 목록 탭·상세 머리 배지·검색 결과 묶음이 모두 이 값을 쓴다(순수 값 — React·CSS 클래스 없음).
// 거래처 파랑 · 신규 보라 · 영업 청록 · 차량 초록 · 미등록 주황. 흰 글자 대비 4.5:1 이상인 색만.
export const MAP_LAYER_COLORS = {
  customer: "#2563eb",
  newLead: "#7c3aed",
  salesLead: "#0f766e",
  vehicle: "#059669",
  unregistered: "#f59e0b"
} as const;

export type MapLayerKey = keyof typeof MAP_LAYER_COLORS;

/** 거래처 마커 등급 배지(등급 보기). 레이어 색(파랑·보라·청록·초록·주황)과 겹치거나 같은 계열이 되지 않게: A = 진한 빨강, B = 진한 남색(무채색 가까움), C = 회색. */
export const MAP_GRADE_COLORS = { A: "#be123c", B: "#1e293b", C: "#64748b" } as const;

/** 리드 종류별 마커·배지 색. */
export function leadLayerColor(type: "new" | "sales"): string {
  return type === "new" ? MAP_LAYER_COLORS.newLead : MAP_LAYER_COLORS.salesLead;
}

/** 오른쪽 목록 탭 값 → 그 레이어 색. */
export function listTabColor(tab: "new" | "sales" | "customers" | "drivers"): string {
  return tab === "new"
    ? MAP_LAYER_COLORS.newLead
    : tab === "sales"
      ? MAP_LAYER_COLORS.salesLead
      : tab === "drivers"
        ? MAP_LAYER_COLORS.vehicle
        : MAP_LAYER_COLORS.customer;
}
