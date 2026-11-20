export type PromotionAvailability = { state: "known"; remaining: number | null; storeLimit: number | null }
  | { state: "unavailable" };

const quantity = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  Number.isSafeInteger(Math.round(value * 1000)) && Math.abs(value - Math.round(value * 1000) / 1000) <= Number.EPSILON * Math.max(1, value) * 4;
const limit = (value: unknown) => value === null || (quantity(value) && Number.isSafeInteger(value));

/** Only the reserved-quantity RPC result is a remaining quantity. Raw stock is not. */
export function promotionAvailabilityFromRow(input: unknown): PromotionAvailability {
  if (!input || typeof input !== "object") return { state: "unavailable" };
  const row = input as Record<string, unknown>;
  if (!limit(row.stock) || !quantity(row.reserved_quantity) || !limit(row.per_store_limit)) return { state: "unavailable" };
  if (row.stock === null ? row.remaining_quantity !== null : !quantity(row.remaining_quantity) || row.remaining_quantity > Number(row.stock))
    return { state: "unavailable" };
  return { state: "known", remaining: row.remaining_quantity as number | null, storeLimit: row.per_store_limit as number | null };
}

const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
export function promotionAvailabilityLabels(value: PromotionAvailability, unit: string) {
  if (value.state === "unavailable") return { remaining: "행사 잔량 확인 필요", limit: null };
  return { remaining: value.remaining === null ? "행사 수량 제한 없음" : `행사 남은 수량 ${format.format(value.remaining)}${unit}`,
    limit: value.storeLimit === null ? null : `매장당 총 한도 ${format.format(value.storeLimit)}${unit} · 기존 주문 포함` };
}
