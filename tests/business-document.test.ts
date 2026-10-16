import { describe, expect, it } from "vitest";
import { calculateErpLine, calculateErpTotals, calculateLedgerBalance } from "../domains/erp/business-document";
import {
  buildBusinessDocumentLineRows,
  shouldRenumberDraftDocument,
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

  it("품목 RPC payload에 DB 생성 금액 컬럼을 포함하지 않는다", () => {
    const [row] = buildBusinessDocumentLineRows([{
      productName: "테스트 품목",
      quantity: 1.25,
      taxType: "taxable",
      unit: "EA",
      unitPrice: 101,
    }]);

    expect(row).toMatchObject({
      product_name: "테스트 품목",
      quantity: 1.25,
      unit_price: 101,
      memo: null,
    });
    expect(row).not.toHaveProperty("supply_amount");
    expect(row).not.toHaveProperty("tax_amount");
    expect(row).not.toHaveProperty("total_amount");
  });

  it("RPC 품목 payload는 허용된 키만 포함한다", () => {
    const [row] = buildBusinessDocumentLineRows([{
      productCatalogId: "product-1",
      supplierProductId: "supplier-product-1",
      productCode: " P-001 ",
      productName: " 양파 ",
      specification: " 10kg ",
      unit: " 망 ",
      taxType: "exempt",
      quantity: 2,
      unitPrice: 15000,
      memo: " 산지 직송 ",
    }]);
    expect(Object.keys(row).sort()).toEqual([
      "memo", "product_catalog_id", "product_code", "product_name", "quantity",
      "specification", "supplier_product_id", "tax_type", "unit", "unit_price",
    ].sort());
    expect(row).toMatchObject({ product_name: "양파", specification: "10kg", unit: "망", memo: "산지 직송" });
  });

  it("작성중 전표만 거래일 연도가 달라질 때 재채번한다", () => {
    expect(shouldRenumberDraftDocument({ status: "draft", documentNumber: "S-2026-000001" }, "2027-01-02")).toBe(true);
    expect(shouldRenumberDraftDocument({ status: "draft", documentNumber: "S-2026-000001" }, "2026-12-31")).toBe(false);
    expect(shouldRenumberDraftDocument({ status: "confirmed", documentNumber: "S-2026-000001" }, "2027-01-02")).toBe(false);
  });
});
