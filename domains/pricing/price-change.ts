export const PRICE_CHANGE_NEUTRAL_THRESHOLD_PERCENT = 0.5;
// 매입 전표 단가 변동이 이 값(%) 이상이면 대표 [반영] 전까지 현재 매입가·판매가 반영 보류. docs/sql-drafts/20261113-e2-*.sql 의 purchase_variance_hold_percent() 와 같은 값.
export const PURCHASE_VARIANCE_HOLD_PERCENT = 20;

export type PurchasePriceRecord = {
  id: string;
  effectiveDate: string;
  recordedAt: string;
  price: number;
  validity: "valid" | "corrected" | "cancelled" | "returned";
};

export type PurchasePriceChange = {
  state: "unavailable" | "first_purchase" | "no_purchase" | "steady" | "up" | "down";
  currentPrice: number | null;
  previousPrice: number | null;
  changePercent: number | null;
  shouldDisplay: boolean;
};

/** Compares the last valid purchase of the date with the preceding valid daily price. */
export function calculatePurchasePriceChange(records: PurchasePriceRecord[], targetDate: string): PurchasePriceChange {
  const latestByDate = new Map<string, PurchasePriceRecord>();
  const valid = records
    .filter((record) => record.validity === "valid" && record.price > 0 && Number.isFinite(record.price)
      && /^\d{4}-\d{2}-\d{2}$/.test(record.effectiveDate) && record.effectiveDate <= targetDate
      && Number.isFinite(Date.parse(record.recordedAt)))
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate)
      || Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.id.localeCompare(right.id));

  for (const record of valid) latestByDate.set(record.effectiveDate, record);
  const daily = Array.from(latestByDate.values());
  const current = daily.at(-1);
  if (!current) return { state: "unavailable", currentPrice: null, previousPrice: null, changePercent: null, shouldDisplay: false };
  if (!latestByDate.has(targetDate)) return { state: "no_purchase", currentPrice: current.price, previousPrice: null, changePercent: null, shouldDisplay: false };

  const previous = daily.at(-2);
  if (!previous) return { state: "first_purchase", currentPrice: current.price, previousPrice: null, changePercent: null, shouldDisplay: false };

  const changePercent = ((current.price - previous.price) / previous.price) * 100;
  const state = Math.abs(changePercent) < PRICE_CHANGE_NEUTRAL_THRESHOLD_PERCENT ? "steady" : changePercent > 0 ? "up" : "down";
  return { state, currentPrice: current.price, previousPrice: previous.price, changePercent, shouldDisplay: state !== "steady" };
}
