import { describe, expect, it } from "vitest";
import { calculateErpLine, calculateErpTotals } from "../domains/erp/business-document";
import { summarizeOrder, type DeliveryPolicy } from "../domains/order/order-rules";
import { calculateQuoteTaxLine, calculateQuoteTaxTotals } from "../domains/quote/quote";
import { lineAmounts, splitIncludedTax } from "../domains/pricing/vat-split";

const policy: DeliveryPolicy = { cutoffDaysBefore: 0, cutoffTime: "00:00", deliveryFee: 0, holidays: [], minimumAmount: 0, minimumPolicy: "notice", weekdays: [1, 3, 5] };
const BOUNDARY = [50, 300, 500, 850, 1050, 1600, 2450, 7550];

describe("CX-134 부가세 포함가 공급가·세액 나누기 통일", () => {
  it("T=50~100,000(50원 간격) 전부: 공급가+세액=총액=T, 주문·ERP·견적이 같은 값", () => {
    for (let t = 50; t <= 100000; t += 50) {
      const split = splitIncludedTax(t);
      expect(split.supplyAmount + split.taxAmount).toBe(t);
      expect(split.supplyAmount).toBe(Math.floor((20 * t + 11) / 22)); // 정수식과 부동소수 round(T/1.1)가 같음(동점 없음)
      expect(calculateErpLine({ quantity: 1, unitPrice: t, taxType: "taxable", priceIncludesTax: true })).toEqual(split);
      expect(calculateQuoteTaxLine(t, 1, "taxable", true)).toEqual(split);
      const order = summarizeOrder([{ productId: "p", quantity: 1, unitPrice: t, taxType: "taxable", priceIncludesTax: true }], policy);
      expect([order.taxableSupply, order.tax, order.knownSubtotal]).toEqual([split.supplyAmount, split.taxAmount, t]);
    }
  });

  it("경계값(공급가로 못 맞추는 500·1,050·1,600 포함)도 합계 = T", () => {
    for (const t of BOUNDARY) {
      const totals = calculateErpTotals([{ quantity: 1, unitPrice: t, taxType: "taxable", priceIncludesTax: true }]);
      expect(totals.totalAmount).toBe(t);
      expect(totals.taxableSupplyAmount + totals.taxAmount).toBe(t);
    }
    // 예전 규칙(포함가를 공급가 455로 바꿔 넘기고 세액을 다시 계산)이면 500은 455+46=501로 1원 어긋난다.
    expect(calculateErpLine({ quantity: 1, unitPrice: Math.round(500 / 1.1), taxType: "taxable" }).totalAmount).toBe(501);
    expect(calculateErpLine({ quantity: 1, unitPrice: 500, taxType: "taxable", priceIncludesTax: true }).totalAmount).toBe(500);
  });

  it("수량이 있어도 줄 총액 = round(수량×단가), 여러 줄 합계도 맞음", () => {
    const lines = [
      { quantity: 3, unitPrice: 500, taxType: "taxable" as const, priceIncludesTax: true },
      { quantity: 0.5, unitPrice: 100, taxType: "taxable" as const, priceIncludesTax: true },
      { quantity: 2, unitPrice: 1000, taxType: "exempt" as const, priceIncludesTax: true },
      { quantity: 2, unitPrice: 1000, taxType: "taxable" as const }
    ];
    const erp = calculateErpTotals(lines);
    const quote = calculateQuoteTaxTotals(lines);
    expect(erp.totalAmount).toBe(1500 + 50 + 2000 + 2200);
    expect(erp.taxableSupplyAmount + erp.exemptSupplyAmount + erp.taxAmount).toBe(erp.totalAmount);
    expect(quote).toEqual(erp);
  });

  it("공급가 기준(포함가 아님) 계산은 예전과 똑같다", () => {
    for (let s = 0; s <= 20000; s += 7) {
      const tax = Math.round(s * 0.1);
      expect(lineAmounts(s, "taxable")).toEqual({ supplyAmount: s, taxAmount: tax, totalAmount: s + tax });
      expect(lineAmounts(s, "exempt", true)).toEqual({ supplyAmount: s, taxAmount: 0, totalAmount: s });
    }
  });
});
