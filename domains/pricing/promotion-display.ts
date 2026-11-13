// CC-20: 행사·임박 목록 표시용 계산(순수 함수). 정상가는 정상 매입가 × (1+마진), 10원 단위 올림.
export type PromotionPriceInput = { price: number; regularCost?: number | null; margin?: number | null };

export function regularPrice(p: PromotionPriceInput): number | null {
  return p.regularCost && p.margin != null ? Math.ceil((p.regularCost * (100 + p.margin)) / 1000) * 10 : null;
}

/** 할인율(%) — 정상가가 없거나 행사가가 정상가 이상이면 null(할인 아님). */
export function discountPercent(p: PromotionPriceInput): number | null {
  const regular = regularPrice(p);
  if (!regular || p.price >= regular) return null;
  return Math.round(((regular - p.price) / regular) * 100);
}
