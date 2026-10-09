export const QUOTE_MARGIN_PRESETS = [10, 12, 15] as const;
export type QuoteMarginPreset = (typeof QUOTE_MARGIN_PRESETS)[number];

export type QuoteLine = {
  id: string;
  catalogProductId?: string;
  item: string;
  spec: string;
  unit: string;
  qty: number;
  purchasePrice: number;
  unitPrice: number;
  marginRate: number;
  matchStatus: "matched" | "unmatched" | "requested";
  requestPhotoName?: string;
};

export type CustomerQuoteLine = Pick<QuoteLine, "id" | "item" | "qty" | "spec" | "unit" | "unitPrice"> & {
  amount: number;
};

export function sanitizeMoney(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function calculateSalesPrice(purchasePrice: number, marginRate: number, roundingUnit = 10) {
  const cost = sanitizeMoney(purchasePrice);
  const rate = Math.min(99, Math.max(0, Number.isFinite(marginRate) ? marginRate : 0));
  if (!cost) return 0;
  const raw = cost / (1 - rate / 100);
  return Math.ceil(raw / roundingUnit) * roundingUnit;
}

export function calculateQuoteLine(line: QuoteLine) {
  const qty = Number.isFinite(line.qty) && line.qty > 0 ? line.qty : 0;
  const purchaseAmount = sanitizeMoney(line.purchasePrice) * qty;
  const salesAmount = sanitizeMoney(line.unitPrice) * qty;
  const expectedProfit = salesAmount - purchaseAmount;
  return {
    expectedProfit,
    marginRate: salesAmount > 0 ? (expectedProfit / salesAmount) * 100 : 0,
    purchaseAmount,
    salesAmount
  };
}

export function calculateQuoteTotals(lines: QuoteLine[]) {
  return lines.reduce(
    (total, line) => {
      const value = calculateQuoteLine(line);
      total.purchaseAmount += value.purchaseAmount;
      total.salesAmount += value.salesAmount;
      total.expectedProfit += value.expectedProfit;
      total.marginRate = total.salesAmount > 0 ? (total.expectedProfit / total.salesAmount) * 100 : 0;
      return total;
    },
    { expectedProfit: 0, marginRate: 0, purchaseAmount: 0, salesAmount: 0 }
  );
}

/** 거래처 공유 데이터에는 매입가·마진·예상 이익을 구조적으로 포함하지 않습니다. */
export function toCustomerQuoteLines(lines: QuoteLine[]): CustomerQuoteLine[] {
  return lines
    .filter((line) => line.item.trim())
    .map(({ id, item, qty, spec, unit, unitPrice }) => ({
      amount: sanitizeMoney(unitPrice) * (qty > 0 ? qty : 0),
      id,
      item: item.trim(),
      qty,
      spec: spec.trim(),
      unit: unit.trim(),
      unitPrice: sanitizeMoney(unitPrice)
    }));
}

export function resolveQuoteValidUntil(validDays: number, issuedAt = new Date()) {
  const days = Number.isFinite(validDays) ? Math.min(365, Math.max(1, Math.round(validDays))) : 14;
  const result = new Date(issuedAt);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

export function normalizeProductToken(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

export function findCatalogMatch<T extends { id: string; name: string; spec?: string; unit?: string }>(
  input: { item: string; spec?: string; unit?: string },
  catalog: T[]
) {
  const itemToken = normalizeProductToken(input.item);
  if (!itemToken) return null;
  return (
    catalog.find((product) => {
      if (normalizeProductToken(product.name) !== itemToken) return false;
      const specMatches = !input.spec || !product.spec || normalizeProductToken(input.spec) === normalizeProductToken(product.spec);
      const unitMatches = !input.unit || !product.unit || normalizeProductToken(input.unit) === normalizeProductToken(product.unit);
      return specMatches && unitMatches;
    }) || null
  );
}
