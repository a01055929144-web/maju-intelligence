import { lineAmounts } from "../pricing/vat-split";

export type ErpTaxType = "taxable" | "exempt";

export type ErpLineInput = {
  quantity: number;
  unitPrice: number;
  taxType: ErpTaxType;
  /** 단가가 부가세 포함가이면 true. 공급가·세액은 주문과 같은 규칙(lineAmounts)으로 나눈다. */
  priceIncludesTax?: boolean;
};

export function calculateErpLine(input: ErpLineInput) {
  return lineAmounts(Math.round(input.quantity * input.unitPrice), input.taxType, input.priceIncludesTax === true);
}

export function calculateErpTotals(lines: ErpLineInput[]) {
  return lines.reduce(
    (sum, line) => {
      const amount = calculateErpLine(line);
      if (line.taxType === "taxable") sum.taxableSupplyAmount += amount.supplyAmount;
      else sum.exemptSupplyAmount += amount.supplyAmount;
      sum.taxAmount += amount.taxAmount;
      sum.totalAmount += amount.totalAmount;
      return sum;
    },
    { taxableSupplyAmount: 0, exemptSupplyAmount: 0, taxAmount: 0, totalAmount: 0 },
  );
}

export function calculateLedgerBalance(openingBalance: number, amounts: number[]) {
  return amounts.reduce((balance, amount) => balance + amount, openingBalance);
}

