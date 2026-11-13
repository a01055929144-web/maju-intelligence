import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRICE_CHANGE_NEUTRAL_THRESHOLD_PERCENT } from "../domains/pricing/price-change";

describe("E2 purchase document cost draft", () => {
  it("holds variances at the same threshold as the CX-06 price change rule", () => {
    const sql = readFileSync("docs/sql-drafts/20261113-e2-purchase-document-cost.sql", "utf8");
    const match = sql.match(/purchase_variance_hold_percent\(\)[\s\S]*?select ([0-9.]+)::numeric/);
    expect(Number(match?.[1])).toBe(PRICE_CHANGE_NEUTRAL_THRESHOLD_PERCENT);
  });
});
