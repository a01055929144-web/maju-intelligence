import { describe, expect, it } from "vitest";
import { calculateErpLine, calculateErpTotals, calculateLedgerBalance } from "../domains/erp/business-document";
import {
  buildBusinessDocumentLineRows,
  replaceDraftLinesWithCompensation,
} from "../lib/business-documents";

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

  it("품목 INSERT payload에 DB 생성 금액 컬럼을 포함하지 않는다", () => {
    const [row] = buildBusinessDocumentLineRows("company-1", "document-1", [{
      productName: "테스트 품목",
      quantity: 1.25,
      taxType: "taxable",
      unit: "EA",
      unitPrice: 101,
    }]);

    expect(row).toMatchObject({
      company_id: "company-1",
      document_id: "document-1",
      product_name_snapshot: "테스트 품목",
      quantity: 1.25,
      unit_price: 101,
    });
    expect(row).not.toHaveProperty("supply_amount");
    expect(row).not.toHaveProperty("tax_amount");
    expect(row).not.toHaveProperty("total_amount");
  });

  it("신규 전표 품목 저장 실패 시 생성된 헤더를 삭제한다", async () => {
    const calls: string[] = [];
    await expect(replaceDraftLinesWithCompensation({
      isNewDocument: true,
      replaceLines: async () => { calls.push("replace"); throw new Error("insert failed"); },
      deleteNewHeader: async () => { calls.push("delete-header"); },
      restorePreviousLines: async () => { calls.push("restore-lines"); },
    })).rejects.toThrow("insert failed");
    expect(calls).toEqual(["replace", "delete-header"]);
  });

  it("기존 전표 품목 저장 실패 시 이전 품목을 복원한다", async () => {
    const calls: string[] = [];
    await expect(replaceDraftLinesWithCompensation({
      isNewDocument: false,
      replaceLines: async () => { calls.push("replace"); throw new Error("insert failed"); },
      deleteNewHeader: async () => { calls.push("delete-header"); },
      restorePreviousLines: async () => { calls.push("restore-lines"); },
    })).rejects.toThrow("insert failed");
    expect(calls).toEqual(["replace", "restore-lines"]);
  });
});
