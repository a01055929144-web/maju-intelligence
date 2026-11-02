import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { median } from "../domains/inventory/unit-conversion";

const sql = (path: string) => readFileSync(path, "utf8").toLowerCase();
const erp = sql("supabase/migrations/20261016190000_erp_phase_1_documents_ledger.sql");
const inventory = sql("supabase/migrations/20261016202000_inventory_phase_1.sql");
const order = sql("supabase/migrations/20261102114602_pricing_p2_store_ordering.sql");

describe("backend contract I-1..I-12 (docs/backend/04_GAPS.md)", () => {
  it("I-1: applied pricing/order table definitions carry company_id", () => {
    for (const file of [
      "supabase/migrations/20261102114600_pricing_p0.sql",
      "supabase/migrations/20261102114601_pricing_p1.sql",
      "supabase/migrations/20261102114602_pricing_p2_store_ordering.sql",
    ]) {
      const definitions = [...sql(file).matchAll(/create table (?:if not exists )?public\.\w+\s*\(([\s\S]*?)\);/g)];
      expect(definitions.length).toBeGreaterThan(0);
      for (const [, body] of definitions) expect(body).toMatch(/\bcompany_id\b/);
    }
  });
  it("I-2: ledger uses append-only guard and reversal entries", () => {
    expect(erp).toContain("partner_ledger_entries_append_only_trg");
    expect(erp).toContain("reject_append_only_mutation");
    expect(erp).toContain("'reversal'");
  });
  it("I-3: inventory writes have a company-scoped idempotency key", () => {
    expect(inventory).toContain("inventory_movements_idempotency_uq unique(company_id, idempotency_key)");
    expect(inventory).toContain("inventory_document_positions");
  });
  it.skip("I-4: single resolve_price is not implemented (G1)", () => {});
  it("I-5: confirmed document mutation is guarded and line price is stored", () => {
    expect(erp).toContain("guard_business_document_mutation");
    expect(erp).toMatch(/unit_price\s+bigint/);
  });
  it.skip("I-6: deposit balance lock is not implemented (G5)", () => {});
  it("I-7: store orders and payments reject duplicate idempotency keys", () => {
    expect(order).toContain("store_orders_idempotency_uq unique (company_id, link_id, idempotency_key)");
    expect(erp).toContain("partner_ledger_entries_idempotency_uq unique (company_id, idempotency_key)");
  });
  it.skip("I-8: one confirmed purchase voucher per purchase order awaits purchase_orders (G3)", () => {});
  it("I-9: public store validates a signed token and both feature switches", () => {
    const route = readFileSync("app/api/storefront/route.ts", "utf8");
    expect(route).toContain("verifyStoreLinkToken");
    expect(route).toContain("priceSheetsEnabled()");
    expect(route).toContain("storeOrderingEnabled()");
  });
  it("I-10: CI requires project-specific approval for new migrations", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("Require approval for new migration files");
    expect(workflow).toContain("DB-APPROVED:");
  });
  it.skip("I-11: dated base prices are only a SQL draft (G8)", () => {});
  it("I-12: median handles odd, even, and no observation fallback", () => {
    expect(median([9, 11, 10])).toBe(10);
    expect(median([9, 11, 10, 12])).toBe(10.5);
    expect(median([], 8)).toBe(8);
  });
});
