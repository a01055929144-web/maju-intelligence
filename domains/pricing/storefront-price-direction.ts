import type { DocumentContent, PrintLine } from "./document";

export type SalesPriceDirection = "up" | "down" | "flat";
export function publicSalesPriceDirection(value: unknown): SalesPriceDirection | null {
  return value === "up" || value === "down" || value === "flat" ? value : null;
}
export function salesPriceDirection(current: number, previous: number): SalesPriceDirection | null {
  if (![current, previous].every(price => Number.isSafeInteger(price) && price >= 0 && price <= 1e12)) return null;
  return current === previous ? "flat" : current > previous ? "up" : "down";
}
export function publishedPriceKey(line: Pick<PrintLine, "productId" | "unit" | "promotionId">) {
  return JSON.stringify([line.productId, line.unit, line.promotionId ?? null]);
}
function index(lines: readonly PrintLine[]) {
  const result = new Map<string, PrintLine | null>();
  for (const line of lines) {
    if (!line || line.visible !== true || typeof line.productId !== "string" || typeof line.unit !== "string" || !line.unit.trim()
      || (line.spec != null && typeof line.spec !== "string")
      || (line.promotionId != null && typeof line.promotionId !== "string")
      || !["taxable", "exempt"].includes(line.taxType)) continue;
    const key = publishedPriceKey(line);
    result.set(key, result.has(key) ? null : line);
  }
  return result;
}
/** Compare immutable published selling prices, never source costs or live margin inputs. */
export function publishedPriceDirections(current: DocumentContent, previous: DocumentContent | null) {
  const result = new Map<string, SalesPriceDirection>();
  if (!previous || current.showPrice !== true || previous.showPrice !== true || current.kind !== previous.kind
    || (current.recipient ?? "") !== (previous.recipient ?? "")
    || !Array.isArray(current.lines) || !Array.isArray(previous.lines)) return result;
  const before = index(previous.lines);
  for (const [key, line] of Array.from(index(current.lines))) {
    const old = before.get(key);
    if (!line || !old || line.taxType !== old.taxType || (line.spec || "").trim() !== (old.spec || "").trim()) continue;
    const direction = salesPriceDirection(line.price, old.price);
    if (direction) result.set(key, direction);
  }
  return result;
}
