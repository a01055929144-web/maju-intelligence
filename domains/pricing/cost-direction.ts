export type CostDirection = "up" | "down";

export function publicCostDirection(value: unknown): CostDirection | null {
  return value === "up" || value === "down" ? value : null;
}
