import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "docs/sql-drafts/20261027-01-K-map.sql"), "utf8");

describe("map filter SQL approval candidate", () => {
  it("commits an idempotent schema candidate without enabling production use", () => {
    expect(sql).toContain("create table if not exists public.map_filter_presets");
    expect(sql).toContain("add column if not exists area_kind");
    expect(sql).toContain("create index if not exists company_lead_search_regions_company_kind_idx");
    expect(sql).toContain("if not exists (");
    expect(sql).toContain("company_lead_search_regions_area_kind_check");
    expect(sql).toContain("commit;");
    expect(sql).not.toContain("rollback;");
    expect(sql).toContain("MAP_FILTER_PERSISTENCE_ENABLED");
  });

  it("keeps direct Data API roles blocked and server access explicit", () => {
    expect(sql).toContain("alter table public.map_filter_presets enable row level security");
    expect(sql).toContain("revoke all on table public.map_filter_presets from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.map_filter_presets to service_role");
  });
});
