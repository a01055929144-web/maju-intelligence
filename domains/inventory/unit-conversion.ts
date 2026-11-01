export function median(values: readonly number[], fallback?: number): number | undefined {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return fallback;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function convertToSalesUnit(quantity: number, toSalesUnitQuantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) throw new RangeError("수량은 0 이상이어야 합니다.");
  if (!Number.isFinite(toSalesUnitQuantity) || toSalesUnitQuantity <= 0) throw new RangeError("단위 환산값은 0보다 커야 합니다.");
  return Math.round(quantity * toSalesUnitQuantity * 1000) / 1000;
}
