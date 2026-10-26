import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "docs/sql-drafts/20261027-01-K-map.sql"), "utf8");
const appliedMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261026225502_map_filter_presets_and_area_kind_record.sql"),
  "utf8"
);

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
    expect(sql).toContain("5건 SQL 초안 일괄 승인 후 이 DDL을 timestamp migration으로 옮겨 staging → production 순서로 적용한다");
    expect(sql).toContain("MAP_FILTER_PERSISTENCE_ENABLED=false와 확장 후보 저장 경로 OFF를 유지한다");
    expect(sql).not.toContain("칼럼 DDL도 migration으로 옮기지 않음");
  });

  it("supports legacy owner sessions without pretending every actor has an app_users row", () => {
    expect(sql).toContain("actor_key text not null");
    expect(sql).toContain("app_user_id uuid references public.app_users(id) on delete cascade");
    expect(sql).toContain("actor_key = 'app_user:' || app_user_id::text");
    expect(sql).toContain("actor_key = 'legacy_owner:' || company_id::text");
    expect(sql).toContain("actor_identity_required(409)");
    expect(sql).toContain("MAJU 관리자 미리보기/대행 저장은 허용하지 않는다");
    expect(sql).not.toContain("user_id uuid not null references public.app_users");
  });

  it("keeps direct Data API roles blocked and server access explicit", () => {
    expect(sql).toContain("alter table public.map_filter_presets enable row level security");
    expect(sql).toContain("revoke all on table public.map_filter_presets from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.map_filter_presets to service_role");
  });

  it("records the production-applied DDL without re-enabling or rerunning production", () => {
    expect(appliedMigration).toContain("DO NOT RUN THIS MIGRATION AGAIN AGAINST THE CURRENT PRODUCTION DATABASE");
    expect(appliedMigration).toContain("MAP_FILTER_PERSISTENCE_ENABLED remains false");
    expect(appliedMigration).toContain("create table if not exists public.map_filter_presets");
    expect(appliedMigration).toContain("actor_key = 'legacy_owner:' || company_id::text");
    expect(appliedMigration).toContain("alter table public.map_filter_presets enable row level security");
    expect(appliedMigration).toContain("revoke all on table public.map_filter_presets from public, anon, authenticated");
    expect(appliedMigration).toContain("add column if not exists area_kind text not null default 'assigned'");
  });
});
