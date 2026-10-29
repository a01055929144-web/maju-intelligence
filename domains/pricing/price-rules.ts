/** P0 uses gross margin (profit / sales), matching quote pricing. Money is KRW. */


export type MarginGroup = { id: string; name: string; margin: number; rounding: number };
export type PriceItem = {
  id: string; name: string; groupId: string | null; cost: number;
  price: number; appliedCost: number | null; appliedMargin: number | null;
  appliedRounding: number | null; active: boolean; directPrice: number | null;
};
export type PriceState = { groups: MarginGroup[]; items: PriceItem[]; lastBatch: string | null; restored: boolean };
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
export function needsRecalculation(item: PriceItem, groups: readonly MarginGroup[]) {
  const group = groups.find(g => g.id === item.groupId);
  return Boolean(item.directPrice === null && item.active && group && item.cost > 0 && (
    item.appliedCost !== item.cost || item.appliedMargin !== group.margin || item.appliedRounding !== group.rounding
  ));
}
