export type VatTaxType = "taxable" | "exempt";

/** 부가세 포함 총액 T를 나눈다. 공급가 = round(T/1.1), 세액 = T − 공급가. 합은 항상 T다. */
export function splitIncludedTax(gross: number) {
  const supply = Math.round(gross / 1.1);
  return { supplyAmount: supply, taxAmount: gross - supply, totalAmount: gross };
}

/**
 * 한 줄의 공급가·세액·총액. `gross`는 round(수량×단가).
 * 포함가 과세 줄은 세액을 공급가×0.1로 다시 계산하지 않는다(주문·전표·견적·ERP 공통 규칙).
 */
export function lineAmounts(gross: number, taxType: VatTaxType, priceIncludesTax = false) {
  if (taxType === "exempt") return { supplyAmount: gross, taxAmount: 0, totalAmount: gross };
  if (priceIncludesTax) return splitIncludedTax(gross);
  const taxAmount = Math.round(gross * 0.1);
  return { supplyAmount: gross, taxAmount, totalAmount: gross + taxAmount };
}
