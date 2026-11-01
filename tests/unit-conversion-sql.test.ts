import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261102-WO-03-unit-conversion-bplus.sql", "utf8");

describe("WO-03 unit conversion SQL draft", () => {
  it("extends the existing conversion ledger instead of creating a duplicate", () => {
    expect(sql).toContain("alter table public.product_unit_conversions");
    expect(sql).not.toMatch(/create table(?: if not exists)? public\.product_purchase_units/i);
  });

  it("keeps one default purchase unit and product-scoped observations", () => {
    expect(sql).toMatch(/product_unit_conversions_one_default_purchase_uq[\s\S]*where is_default_purchase/i);
    expect(sql).toMatch(/foreign key\(company_id, product_catalog_id, conversion_id\)/i);
    expect(sql).toMatch(/product_unit_observations_source_uq[\s\S]*where source_key is not null/i);
  });

  it("uses recent-five median with the fixed conversion as fallback", () => {
    expect(sql).toMatch(/order by o\.observed_at desc, o\.id desc[\s\S]*limit 5/i);
    expect(sql).toMatch(/coalesce\([\s\S]*numeric_median[\s\S]*c\.base_quantity/i);
  });

  it("keeps bulk application company-scoped and service-role only", () => {
    expect(sql).toMatch(/v_product_count <> cardinality\(p_product_ids\)/i);
    expect(sql).toMatch(/raise exception 'product_scope_mismatch'/i);
    expect(sql).toMatch(/revoke all on function public\.apply_category_unit_rule[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.apply_category_unit_rule[\s\S]*to service_role/i);
  });
});
