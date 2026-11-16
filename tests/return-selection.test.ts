import { describe, expect, it } from "vitest";
import { remainingReturnLines, selectReturnLines } from "../domains/erp/return-selection";

const lines = [
  { id: "line-a", productName: "감자", quantity: 5, unitPrice: 1000 },
  { id: "line-b", productName: "양파", quantity: 3, unitPrice: 2000 },
];

describe("CX-40 반품 줄 선택", () => {
  it("선택한 줄과 수량만 반품 초안에 남긴다", () => {
    expect(selectReturnLines(lines, [{ lineId: "line-b", quantity: 2 }])).toEqual([
      { ...lines[1], quantity: 2 },
    ]);
  });

  it("원 수량 초과·없는 줄·중복 선택을 거부한다", () => {
    expect(() => selectReturnLines(lines, [{ lineId: "line-a", quantity: 6 }])).toThrow("원 수량");
    expect(() => selectReturnLines(lines, [{ lineId: "missing", quantity: 1 }])).toThrow("없는 품목");
    expect(() => selectReturnLines(lines, [
      { lineId: "line-a", quantity: 1 },
      { lineId: "line-a", quantity: 1 },
    ])).toThrow("중복");
  });

  it("빈 선택과 0 이하 수량을 거부한다", () => {
    expect(() => selectReturnLines(lines, [])).toThrow("선택");
    expect(() => selectReturnLines(lines, [{ lineId: "line-a", quantity: 0 }])).toThrow("원 수량");
  });

  it("앞서 확정된 반품 수량을 원수량에서 차감한다", () => {
    const remaining = remainingReturnLines(lines, [{ ...lines[0], quantity: 3 }]);
    expect(remaining[0].quantity).toBe(2);
    expect(() => selectReturnLines(remaining, [{ lineId: "line-a", quantity: 3 }])).toThrow("원 수량");
  });
});
