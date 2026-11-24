/** 지도에 보이는 직원 위치의 역할(배송·영업·현장 기록 전용). 기사 배정 여부와 무관하게 구성원의 담당 업무(duties)로 정한다. */
export type LocationRole = "delivery" | "sales" | "field";

/** 배송이 있으면 배송, 아니면 영업이 있으면 영업, 그 외(알바·사무·기타)는 현장. */
export function locationRoleFromDuties(duties: readonly string[] | null | undefined): LocationRole {
  const list = duties ?? [];
  if (list.includes("delivery")) return "delivery";
  if (list.includes("sales")) return "sales";
  return "field";
}

export const LOCATION_ROLE_LABELS: Record<LocationRole, string> = { delivery: "배송", field: "알바·현장", sales: "영업" };
/** 배송은 기존처럼 차량마다 다른 색(여기선 null). 영업·현장은 역할 색으로 구분한다(색만으로 구분하지 않도록 이름에 역할을 함께 적는다). */
export const LOCATION_ROLE_COLORS: Record<LocationRole, string | null> = { delivery: null, field: "#d97706", sales: "#2563eb" };
