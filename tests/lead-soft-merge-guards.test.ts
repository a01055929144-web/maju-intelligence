import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync("lib/store.ts", "utf8");
const migrationSource = readFileSync("supabase/migrations/20261023211000_lead_canonical_soft_merge_phase1.sql", "utf8");

describe("lead soft-merge guards", () => {
  it("excludes merged rows from list, matching, enrichment and route candidate reads", () => {
    expect(storeSource.match(/merged_into_lead_id=is\.null/g)?.length || 0).toBeGreaterThanOrEqual(11);
    expect(storeSource).toContain('const params = [`company_id=eq.${encodeURIComponent(companyId)}`, "merged_into_lead_id=is.null"]');
    expect(storeSource).toContain("&merged_into_lead_id=is.null&business_number=in.");
    expect(storeSource).toContain("&merged_into_lead_id=is.null&is_active=eq.true&is_duplicate=eq.false");
  });

  it("uses deferred self references and cascading company-scoped audit cleanup", () => {
    expect(migrationSource).toContain("company_id uuid not null references public.companies(id) on delete cascade");
    expect(migrationSource).toContain("on delete no action deferrable initially deferred");
    expect(migrationSource).toContain("references public.lead_merge_batches(company_id,id) on delete cascade");
  });
});
