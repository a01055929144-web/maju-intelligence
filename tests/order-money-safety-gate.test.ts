import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { assertOrderMoney, ORDER_MONEY_SCENARIOS } from "./helpers/order-money-safety";

describe("CX-68 order money safety gate", () => {
  it("tracks every mandatory scenario and separates the pending CX-62 receipt contract", () => {
    expect(ORDER_MONEY_SCENARIOS.map(([number]) => number)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(ORDER_MONEY_SCENARIOS.filter(([, , evidence]) => evidence.startsWith("CX-62 isolated"))).toHaveLength(3);
    expect(ORDER_MONEY_SCENARIOS.every(([, , evidence]) => evidence.endsWith(".sql") || evidence.endsWith(".test.sql"))).toBe(true);
    expect(ORDER_MONEY_SCENARIOS.filter(([, , evidence]) => !evidence.startsWith("CX-62 isolated"))
      .every(([, , evidence]) => existsSync(evidence))).toBe(true);
  });

  it("compares order, line, document and ledger totals in won without number coercion", () => {
    expect(() => assertOrderMoney({ orderKnownTotal: 12_345_678_901_234n, lineTotal: 12_345_678_901_234n,
      documentTotal: 12_345_678_901_234n, ledgerIncrease: 12_345_678_901_234n })).not.toThrow();
    expect(() => assertOrderMoney({ orderKnownTotal: 11n, lineTotal: 10n })).toThrow("order_money_mismatch");
  });

  it("allows submitted orders to be checked before CX-62 creates a document", () => {
    expect(() => assertOrderMoney({ orderKnownTotal: 1_100n, lineTotal: 1_100n })).not.toThrow();
  });
});
