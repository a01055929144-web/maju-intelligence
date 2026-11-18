import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { assertOrderMoney, assertOrderMoneyPhase, ORDER_MONEY_SCENARIOS } from "./helpers/order-money-safety";

describe("CX-68 order money safety gate", () => {
  it("tracks every mandatory scenario and names the reviewed CX-62 evidence", () => {
    expect(ORDER_MONEY_SCENARIOS.map(([number]) => number)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(ORDER_MONEY_SCENARIOS.filter(([, , evidence]) => evidence.startsWith("CX-62 #1015@f2fd266"))).toHaveLength(4);
    expect(ORDER_MONEY_SCENARIOS.filter(([, , evidence]) => !evidence.startsWith("CX-62 #1015@f2fd266"))
      .every(([, , evidence]) => existsSync(evidence))).toBe(true);
  });

  it("compares order, line, document and ledger totals in won without number coercion", () => {
    expect(() => assertOrderMoney({ orderKnownTotal: 12_345_678_901_234n, lineTotal: 12_345_678_901_234n,
      documentTotal: 12_345_678_901_234n, ledgerIncrease: 12_345_678_901_234n })).not.toThrow();
    expect(() => assertOrderMoney({ orderKnownTotal: 11n, lineTotal: 10n })).toThrow("order_money_mismatch");
  });

  it("allows submitted orders to be checked before CX-62 creates a document", () => {
    expect(() => assertOrderMoneyPhase("submitted", { orderKnownTotal: 1_100n, lineTotal: 1_100n })).not.toThrow();
    expect(() => assertOrderMoneyPhase("submitted", { orderKnownTotal: 1_100n, lineTotal: 1_100n,
      ledgerIncrease: 0n, inventoryMovementCount: 0n })).not.toThrow();
  });

  it.each([-1n, 1n])("rejects inventory movement %s before receipt", inventoryMovementCount => {
    expect(() => assertOrderMoneyPhase("submitted", {
      orderKnownTotal: 1_100n, lineTotal: 1_100n, ledgerIncrease: 0n, inventoryMovementCount,
    })).toThrow("submitted_has_financial_effect");
  });

  it("keeps receipt draft-only and moves money only when shipped", () => {
    expect(() => assertOrderMoneyPhase("received", { orderKnownTotal: 1_100n, lineTotal: 1_100n,
      documentTotal: 1_100n, ledgerIncrease: 0n, inventoryMovementCount: 0n })).not.toThrow();
    expect(() => assertOrderMoneyPhase("received", { orderKnownTotal: 1_100n, lineTotal: 1_100n,
      documentTotal: 1_100n, ledgerIncrease: 1_100n })).toThrow("receipt_not_draft_only");
    expect(() => assertOrderMoneyPhase("shipped", { orderKnownTotal: 1_100n, lineTotal: 1_100n,
      documentTotal: 1_100n, ledgerIncrease: 1_100n, inventoryMovementCount: 1n })).not.toThrow();
  });
});
