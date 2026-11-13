// CC-40: 판매가 표의 "숨긴 상품 / 손해 / 이익 낮음" 판정. 기준은 여기 한 곳(화면에 숫자 하드코딩 금지).
// 이익 낮음 = 손해는 아니지만 마진율(매입가 대비)이 회사 기본 마진의 이 비율 미만.
export const LOW_PROFIT_RATIO = 0.5;

type PricedItem = { price: number; cost: number; active: boolean };

/** 마진율(%) = (판매가 − 매입가) ÷ 매입가 × 100. 매입가가 0 이하면 계산할 수 없어 null. */
export const marginPercent = (item: Pick<PricedItem, "price" | "cost">) => (item.cost > 0 ? ((item.price - item.cost) / item.cost) * 100 : null);

/** 손해: 이익이 0원 이하(경계 0원 포함). */
export const isLoss = (item: Pick<PricedItem, "price" | "cost">) => item.price - item.cost <= 0;

/** 이익 낮음: 손해가 아니면서 마진율이 기본 마진의 절반 미만(기본 마진이 0이면 비교 대상 없음). */
export function isLowProfit(item: Pick<PricedItem, "price" | "cost">, defaultMargin: number) {
  if (isLoss(item) || defaultMargin <= 0) return false;
  const margin = marginPercent(item);
  return margin !== null && margin < defaultMargin * LOW_PROFIT_RATIO;
}

/** 숨김(비활성) 상품을 기본 목록에서 가른다. 개수·분류·손해 경고·일괄 대상은 모두 visible만 센다. */
export function splitHidden<T extends Pick<PricedItem, "active">>(items: readonly T[]) {
  const visible: T[] = [], hidden: T[] = [];
  for (const item of items) (item.active ? visible : hidden).push(item);
  return { visible, hidden };
}
