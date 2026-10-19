export type StoredMapPanelMode = "split" | "driver" | "customer" | "map";

export function normalizeStoredMapPanelMode(value: string | null): StoredMapPanelMode | null {
  if (value === "newLead" || value === "salesLead") return "customer";
  if (value === "split" || value === "driver" || value === "customer" || value === "map") return value;
  return null;
}

export function parseStoredLeadVisibility(value: string | null) {
  return value === "true";
}
