export type ErpTaxType = "taxable" | "exempt";

export type ErpLineInput = {
  quantity: number;
  unitPrice: number;
  taxType: ErpTaxType;
};

export function calculateErpLine(input: ErpLineInput) {
  const supplyAmount = Math.round(input.quantity * input.unitPrice);
  const taxAmount = input.taxType === "taxable" ? Math.round(supplyAmount * 0.1) : 0;
  return { supplyAmount, taxAmount, totalAmount: supplyAmount + taxAmount };
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

