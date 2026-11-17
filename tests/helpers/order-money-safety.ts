export type MoneySnapshot = {
  orderKnownTotal: bigint;
  lineTotal: bigint;
  documentTotal?: bigint;
  ledgerIncrease?: bigint;
};

export function assertOrderMoney(snapshot: MoneySnapshot) {
  const values = [snapshot.lineTotal, snapshot.documentTotal, snapshot.ledgerIncrease].filter((value): value is bigint => value !== undefined);
  if (values.some(value => value !== snapshot.orderKnownTotal)) throw new Error(`order_money_mismatch:${[snapshot.orderKnownTotal, ...values].join(":")}`);
}

export const ORDER_MONEY_SCENARIOS = [
  [1, "same order retry", "tests/sql/store-member-order.pg17.test.sql"],
  [2, "idempotency conflict", "tests/sql/store-member-order.pg17.test.sql"],
  [3, "edit versus receipt revision", "CX-62 isolated: 2026-11-17-CX-62-order-receipt.pg17.test.sql"],
  [4, "double receipt", "CX-62 isolated: 2026-11-17-CX-62-order-receipt.pg17.test.sql"],
  [5, "document failure rollback", "CX-62 isolated: 2026-11-17-CX-62-order-receipt.pg17.test.sql"],
  [6, "order document ledger equality", "tests/sql/order-money-safety-cx68.pg17.test.sql"],
  [7, "market price receipt guard", "docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.pg17.test.sql"],
  [8, "promotion and quantity limits", "tests/sql/promotion-reservation-cx08.pg17.test.sql"],
  [9, "cutoff holiday weekday minimum", "tests/sql/store-account-order-s2a.pg17.test.sql"],
  [10, "cross-company rejection", "tests/sql/store-member-order.pg17.test.sql"],
  [11, "multi-distributor isolation", "tests/sql/store-account-order-s2a.pg17.test.sql"],
  [12, "cancel and return reversal", "docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.pg17.test.sql"],
  [13, "confirmed document delete guard", "docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.pg17.test.sql"],
  [14, "latest valid price", "tests/sql/promotion-normal-price-cc29c.pg17.test.sql"],
  [15, "5000 products by 3 companies", "tests/sql/order-money-safety-cx68.pg17.test.sql"],
] as const;
