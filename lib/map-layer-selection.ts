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
