import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261029-common-revision-history.sql", "utf8");

describe("common revision history SQL draft", () => {
  it("keeps the draft scoped to lead and customer field revisions", () => {
    expect(sql).toMatch(/create table if not exists public\.common_revision_history/i);
    expect(sql).toMatch(/target_type in \('lead', 'customer'\)/i);
    expect(sql).toMatch(/old_value jsonb/i);
    expect(sql).toMatch(/new_value jsonb/i);
    expect(sql).toMatch(/actor_user_id uuid/i);
    expect(sql).toMatch(/actor_name text not null/i);
    expect(sql).toMatch(/actor_role text not null/i);
    expect(sql).toMatch(/source_path in \('pc', 'mobile', 'admin', 'automation'\)/i);
    expect(sql).toMatch(/common_revision_history_field_allowlist_check/i);
    expect(sql).toMatch(/신규 컬럼은 이 제약을 승인 변경하기 전까지 기본 미기록/i);
  });

  it("enforces tenant targets, append-only writes, and credential rejection", () => {
    expect(sql).toMatch(/lead\.company_id = new\.company_id/i);
    expect(sql).toMatch(/customer\.company_id = new\.company_id/i);
    expect(sql).toMatch(/member\.company_id = new\.company_id/i);
    expect(sql).toMatch(/app_user\.role in \('super_admin', 'maju_super_admin', 'maju_operator', 'operator'\)/i);
    expect(sql).toMatch(/common_revision_history is append-only/i);
    expect(sql).toMatch(/revision_json_contains_sensitive_key/i);
    expect(sql).toContain("storage[_-]?path");
    expect(sql).toContain("https?://");
    expect(sql).toMatch(/sensitive credential values must not be recorded/i);
  });

  it("uses deny-by-default RLS and company-scoped indexes", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.common_revision_history from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert on table public\.common_revision_history to service_role/i);
    expect(sql).toMatch(/\(company_id, target_type, target_id, created_at desc, id\)/i);
    expect(sql).toMatch(/\(company_id, created_at desc, id\)/i);
  });

  it("leaves privacy retention and deletion as an explicit approval gate", () => {
    expect(sql).toMatch(/개인정보 보존·삭제 정책 승인/i);
    expect(sql).toMatch(/익명화 또는 파기 방식/i);
    expect(sql).toMatch(/NEXT_PUBLIC_STORE_REVISION_HISTORY_ENABLED는 계속 false 유지/i);
  });
});
