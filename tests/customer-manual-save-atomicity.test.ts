import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261107-customer-manual-save-atomicity.sql", "utf8");

describe("customer manual save atomicity SQL draft", () => {
  it("keeps tenant scope and optimistic concurrency inside the RPC", () => {
    expect(sql).toContain("where id = p_customer_id and company_id = p_company_id");
    expect(sql).toContain("v_existing.updated_at is distinct from p_expected_updated_at");
    expect(sql).toContain("where id = v_existing.id and company_id = p_company_id");
    expect(sql).toContain("error_message = 'customer_conflict'");
  });

  it("keeps the privileged function service-role only", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).toContain("to service_role");
  });
});
