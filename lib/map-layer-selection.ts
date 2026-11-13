export type MapLeadLayerType = "all" | "new" | "sales";

export function nextLeadLayerSelection(
  visible: boolean,
  current: MapLeadLayerType,
  selected: Exclude<MapLeadLayerType, "all">
): { visible: boolean; type: MapLeadLayerType } {
  if (!visible) return { visible: true, type: selected };
  if (current === "all") return { visible: true, type: selected === "new" ? "sales" : "new" };
  if (current === selected) return { visible: false, type: current };
  return { visible: true, type: "all" };
}

// 유통사 리드는 인허가/개업일이 없어 모두 "sales"로 분류되므로 유통사 지도는 신규/영업 구분 필터를 적용하지 않습니다.
export function matchesMapLeadType(leadType: string, filter: string, distributor: boolean) {
  return distributor || filter === "all" || leadType === filter;
}
