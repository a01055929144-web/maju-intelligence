import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PURCHASE_VARIANCE_HOLD_PERCENT } from "../domains/pricing/price-change";

describe("E2 purchase document cost draft", () => {
  it("holds variances at the 20% purchase hold threshold, separate from the CX-06 display rule", () => {
    const sql = readFileSync("docs/sql-drafts/20261113-e2-purchase-document-cost.sql", "utf8");
    const match = sql.match(/purchase_variance_hold_percent\(\)[\s\S]*?select ([0-9.]+)::numeric/);
    expect(Number(match?.[1])).toBe(PURCHASE_VARIANCE_HOLD_PERCENT);
  });
});
