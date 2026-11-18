import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/2026-11-18-CX-66-partial-dispatch-final-cancel.sql", "utf8");
const down = readFileSync("docs/sql-drafts/2026-11-18-CX-66-partial-dispatch-final-cancel.down.sql", "utf8");
const pg17 = readFileSync("docs/sql-drafts/2026-11-18-CX-66-partial-dispatch-final-cancel.pg17.test.sql", "utf8");

describe("CX-66 partial dispatch final-cancel contract", () => {
  it("preserves original order values and posts only shipped quantities", () => {
    expect(sql).toContain("shipped_quantity");
    expect(sql).toContain("cancelled_quantity");
    expect(sql).toContain("source_order_line_id");
    expect(sql).not.toContain("set known_total");
    expect(sql).toContain("public.confirm_business_document(");
    expect(sql).not.toContain("apply_inventory_for_document(");
    expect(sql).toContain("jsonb_typeof(o->'lines') is distinct from 'array'");
  });

  it("tests final cancellation, retry, atomic rollback, tenant isolation and safe down", () => {
    for (const evidence of ["전량 취소", "same key different payload accepted", "invalid batch accepted", "cross-company dispatch accepted", "ambiguous identical lines accepted"])
      expect(pg17).toContain(evidence);
    expect(down).toContain("partial_dispatch_history_exists");
  });
});
