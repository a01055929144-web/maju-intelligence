import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261027-08-WO-8-billing-plans.sql", "utf8");

describe("WO-8 billing SQL review guards", () => {
  it("compares pg_attribute names with name arrays", () => {
    expect(sql).not.toContain("::text[]");
    expect(sql.match(/::name\[\]/g)?.length).toBe(6);
  });

  it("keeps commercial criteria administrator-configured without seeds", () => {
    expect(sql).toContain("trial_days integer not null");
    expect(sql).toContain("usage_window_months integer not null");
    expect(sql).not.toMatch(/insert\s+into\s+public\.(plans|billing_policy_settings)/i);
    expect(sql).not.toMatch(/monthly_amount_won\s+integer[^\n]*default/i);
    expect(sql).not.toMatch(/monthly_lead_limit\s+integer[^\n]*default/i);
    expect(sql).not.toMatch(/trial_days\s+integer[^\n]*default/i);
    expect(sql).not.toMatch(/usage_window_months\s+integer[^\n]*default/i);
  });

  it("keeps new configuration tables server-only behind RLS", () => {
    for (const table of ["plans", "billing_policy_settings", "subscription_monthly_usage"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      expect(sql).toContain(`grant all on table public.${table} to service_role;`);
    }
  });
});
