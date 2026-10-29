/** Pure KRW rules. Gross margin = profit / sales. Null means inherit; zero is explicit. */
export type MarginGroup = { id: string; name: string; margin: number; rounding: number };
export type MarginCategory = { category: string; groupId: string };
export type PriceItem = {
  id: string; name: string; category: string; groupId: string | null; itemMargin: number | null; cost: number;
  price: number; appliedCost: number | null; appliedMargin: number | null;
  appliedRounding: number | null; active: boolean; directPrice: number | null;
};
export type PriceState = {
  groups: MarginGroup[]; categories: MarginCategory[]; items: PriceItem[];
  defaultMargin: number; defaultRounding: number; pendingCount: number;
  total: number; page: number; pageSize: number; lastBatch: string | null; restored: boolean;
};
export type PriceQuery = { search: string; page: number };
export function calculatePrice(cost: number, margin: number, rounding = 10, directPrice: number | null = null) {
  if (directPrice !== null) {
    if (!Number.isSafeInteger(directPrice) || directPrice < 0 || directPrice > 1e12) throw new Error("직접 단가 범위를 확인해 주세요.");
    return directPrice;
  }
  if (!Number.isFinite(cost) || cost < 0 || cost > 1e12) throw new Error("매입가 범위를 확인해 주세요.");
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error("마진율은 0 이상 100 미만이어야 합니다.");
  if (![1, 10, 100].includes(rounding)) throw new Error("올림 단위를 확인해 주세요.");
  const basisPoints = Math.round(margin * 100);
  if (Math.abs(margin * 100 - basisPoints) > 1e-8) throw new Error("마진율은 소수 둘째 자리까지 입력해 주세요.");
  if (Number(cost.toFixed(2)) !== cost) throw new Error("매입가는 소수 둘째 자리까지 입력해 주세요.");
  const cents = BigInt(cost.toFixed(2).replace(".", ""));
  const numerator = cents * BigInt(10000);
  const divisor = BigInt(100) * BigInt(10000 - basisPoints) * BigInt(rounding);
  const result = Number((numerator + divisor - BigInt(1)) / divisor) * rounding;
  if (!Number.isSafeInteger(result) || result > 1e12) throw new Error("판매가 범위를 초과했습니다.");
  return result;
}
export function resolvePriceRule(item: PriceItem, groups: readonly MarginGroup[], categories: readonly MarginCategory[] = [], defaultMargin = 0, defaultRounding = 10) {
  const groupId = item.groupId ?? categories.find(c => c.category === item.category)?.groupId;
  const group = groups.find(g => g.id === groupId);
  return {
    margin: item.itemMargin ?? group?.margin ?? defaultMargin,
    rounding: group?.rounding ?? defaultRounding,
    source: item.directPrice !== null ? "direct" : item.itemMargin !== null ? "item" : group ? "group" : "default"
  };
}
export function calculateItemPrice(item: PriceItem, groups: readonly MarginGroup[], categories: readonly MarginCategory[] = [], defaultMargin = 0, defaultRounding = 10) {
  const rule = resolvePriceRule(item, groups, categories, defaultMargin, defaultRounding);
  return calculatePrice(item.cost, rule.margin, rule.rounding, item.directPrice);
}
export function needsRecalculation(item: PriceItem, groups: readonly MarginGroup[], categories: readonly MarginCategory[] = [], defaultMargin = 0, defaultRounding = 10) {
  const rule = resolvePriceRule(item, groups, categories, defaultMargin, defaultRounding);
  return Boolean(item.directPrice === null && item.active && item.cost > 0 && (
    item.appliedCost !== item.cost || item.appliedMargin !== rule.margin || item.appliedRounding !== rule.rounding
  ));
}
