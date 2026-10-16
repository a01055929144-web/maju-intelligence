import { describe, expect, it } from "vitest";
import { calculateErpLine, calculateErpTotals, calculateLedgerBalance } from "../domains/erp/business-document";

describe("ERP 전표 금액", () => {
  it("라인별 원 단위 반올림 후 과세·면세 합계를 분리한다", () => {
    expect(calculateErpLine({ quantity: 1.25, unitPrice: 101, taxType: "taxable" })).toEqual({
      supplyAmount: 126,
      taxAmount: 13,
      totalAmount: 139,
    });
    expect(calculateErpTotals([
      { quantity: 1.25, unitPrice: 101, taxType: "taxable" },
      { quantity: 2, unitPrice: 500, taxType: "exempt" },
    ])).toEqual({ taxableSupplyAmount: 126, exemptSupplyAmount: 1000, taxAmount: 13, totalAmount: 1139 });
  });

  it("확정·입금·취소 원장 부호로 잔액을 계산한다", () => {
    expect(calculateLedgerBalance(1000, [11000, -5000, -11000])).toBe(-4000);
  });
});
