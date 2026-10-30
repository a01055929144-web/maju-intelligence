import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("published price and order charge", () => {
  it("charges the visible published price even when a promotion is edited later", () => {
    const sql = readFileSync(resolve("docs/sql-drafts/20261030-pricing-p2-store-ordering.sql"), "utf8");
    const orderFunction = sql.split("create or replace function public.place_store_order(")[1]
      ?.split("revoke all on function public.place_store_order(")[0];
    expect(orderFunction).toBeTruthy();
    expect(orderFunction).toContain("v_price := (v_print_line->>'price')::bigint");
    expect(orderFunction).toContain("v_tax_type := v_print_line->>'taxType'");
    expect(orderFunction).not.toContain("v_price := v_promotion.price");
    expect(orderFunction).not.toContain("v_tax_type := v_promotion.tax_type");
  });
});
