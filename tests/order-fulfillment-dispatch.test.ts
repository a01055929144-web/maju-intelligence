import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/2026-11-18-CX-66-order-dispatch.sql", "utf8");
const pg17 = readFileSync("docs/sql-drafts/2026-11-18-CX-66-order-dispatch.pg17.test.sql", "utf8");
const down = readFileSync("docs/sql-drafts/2026-11-18-CX-66-order-dispatch.down.sql", "utf8");

describe("CX-66 atomic order dispatch contract", () => {
  it("uses the existing document confirmation trigger as the only inventory writer", () => {
    expect(sql).toContain("public.confirm_business_document(");
    expect(sql).not.toContain("apply_inventory_for_document(");
    expect(sql).toContain("order_dispatch_inventory_unresolved");
  });

  it("locks the batch, guards manual confirmation and records idempotency", () => {
    expect(sql).toContain("order by id for update");
    expect(sql).toContain("order_dispatch_idempotency_conflict");
    expect(sql).toContain("order_sale_document_requires_dispatch");
    expect(pg17).toContain("amount mismatch accepted");
    expect(pg17).toContain("count(*) from inventory_movements");
    expect(down).toContain("order_dispatch_history_exists");
    expect(pg17).toContain("delete from public.order_dispatch_requests");
  });
});
