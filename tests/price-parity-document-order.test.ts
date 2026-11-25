import { describe, expect, it } from "vitest";
import { documentDisplayPrice } from "../domains/pricing/document";

// CX-148: 단가표 화면 가격(documentDisplayPrice)과 주문 가격(self_order_price_v2)은 같은 값이어야 한다.
// 같은 행렬이 docs/sql-drafts/2026-11-25-CX-148-order-price-received-documents.pg17.test.sql의 parity 단계에 있다(PG17이 SQL 쪽 값을 검사).
const matrix: Array<[price: number, tax: "taxable" | "exempt", includes: boolean, expected: number]> = [
  [6845, "taxable", false, 6845], [6850, "taxable", true, 7535], [6223, "taxable", true, 6845], [5500, "exempt", true, 5500],
  [6500, "exempt", false, 6500], [4545, "taxable", true, 5000], [9999, "taxable", true, 10999], [5, "taxable", true, 6],
];

describe("CX-148 document price = order price contract", () => {
  it.each(matrix)("price %i %s includes=%s -> %i", (price, tax, includes, expected) => {
    expect(documentDisplayPrice(price, tax, includes)).toBe(expected);
  });
  it("줄 단위 세금 포함 가격(storedIncludesTax)은 곱하지 않는다 - 주문 함수의 priceIncludesTax 줄과 같음", () => {
    expect(documentDisplayPrice(3300, "taxable", true, true)).toBe(3300);
    expect(documentDisplayPrice(3300, "taxable", false, true)).toBe(3300);
  });
});
