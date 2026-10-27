export type MapFilterPresetFilters = {
  excludeClosedStores: boolean;
  gradeFilter: "all" | "A" | "B" | "C";
  industry: string;
  leadType: "all" | "new" | "sales";
  reminderOnly: boolean;
  stage: string;
};

const grades = new Set(["all", "A", "B", "C"]);
const leadTypes = new Set(["all", "new", "sales"]);

export function parseMapFilterPresetFilters(value: unknown): MapFilterPresetFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!grades.has(String(input.gradeFilter)) || !leadTypes.has(String(input.leadType))) return null;
  if (typeof input.industry !== "string" || input.industry.length > 80) return null;
  if (typeof input.stage !== "string" || input.stage.length > 80) return null;
  if (typeof input.excludeClosedStores !== "boolean" || typeof input.reminderOnly !== "boolean") return null;
  return {
    excludeClosedStores: input.excludeClosedStores,
    gradeFilter: input.gradeFilter as MapFilterPresetFilters["gradeFilter"],
    industry: input.industry,
    leadType: input.leadType as MapFilterPresetFilters["leadType"],
    reminderOnly: input.reminderOnly,
    stage: input.stage
  };
}

export function normalizeMapFilterPresetName(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 40) : "";
}
