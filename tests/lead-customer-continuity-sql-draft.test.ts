import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261029-lead-customer-continuity.sql", "utf8");
const design = readFileSync("docs/specs/2026-10-29-lead-customer-continuity-and-retention.md", "utf8");
const pg16Test = readFileSync("docs/sql-drafts/20261029-lead-customer-continuity.pg16.test.sql", "utf8");

describe("lead to customer continuity SQL draft", () => {
  it("keeps the rollout disabled and company scoped", () => {
    expect(sql).toContain("LEAD_CUSTOMER_CONTINUITY_ENABLED=false");
    expect(sql).toMatch(/if not p_rollout_enabled then/i);
    expect(sql).toMatch(/lead\.company_id = p_company_id/i);
    expect(sql).toMatch(/customer\.company_id = p_company_id/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toContain("common_revision_history_prerequisite_not_applied");
    expect(sql).toMatch(/constraint_row\.contype in \('p', 'u'\)/i);
    expect(sql).toMatch(/array\['company_id', 'id'\]::name\[\]/i);
    expect(sql).not.toContain("conname = 'normalized_customers_company_id_id_unique'");
    expect(pg16Test).toContain("fixture_customer_company_id_unique");
    expect(sql).toMatch(/foreign key \(company_id, matched_customer_id\)/i);
    expect(sql).toMatch(/on delete set null \(matched_customer_id\)/i);
    expect(sql).toMatch(/validate constraint business_permit_leads_company_matched_customer_fk/i);
    expect(pg16Test).toContain("cross_company_matched_customer_should_be_forbidden");
  });

  it("fills only empty customer fields and preserves the matched customer link", () => {
    expect(sql).toMatch(/coalesce\(nullif\(customer\.phone, ''\)/i);
    expect(sql).toMatch(/coalesce\(nullif\(customer\.fax, ''\)/i);
    expect(sql).toContain("v_fax !~ '^(0[0-9]{8,10}|1[568][0-9]{6})$'");
    expect(pg16Test).toContain("malformed_fax_was_copied_to_customer");
    expect(sql).toMatch(/matched_customer_id = p_customer_id/i);
    expect(sql).toMatch(/hours\.source = 'manual'/i);
    expect(sql).toContain("https://www.instagram.com/");
    expect(sql).toContain("https://talk.naver.com/ct/");
    expect(sql).toMatch(/talk\\\.naver\\\.com/i);
    expect(sql).toMatch(/customer\.instagram_url, ''\) is null and v_instagram_url is not null/i);
    expect(sql).toMatch(/lead_actions와 company_do_not_contact는 복사·수정하지 않는다/i);
  });

  it("exposes linked history and DNC as read-only server views", () => {
    expect(sql).toMatch(/create or replace view public\.customer_linked_lead_actions_v1/i);
    expect(sql).toMatch(/create or replace view public\.customer_linked_lead_dnc_v1/i);
    expect(sql).toMatch(/create or replace view public\.customer_linked_lead_contact_sources_v1/i);
    expect(sql).toMatch(/with \(security_invoker = true\)/i);
    expect(sql).toMatch(/dnc\.source_lead_id = lead\.id/i);
    expect(sql).toMatch(/grant select on public\.customer_linked_lead_dnc_v1 to service_role/i);
    expect(sql).not.toMatch(/grant (insert|update|delete).*customer_linked_lead_dnc_v1/i);
  });

  it("redacts phone and address after 90 days or on a deletion request", () => {
    expect(sql).toMatch(/field_key in \('phone', 'address'\)/i);
    expect(sql).toMatch(/interval '90 days'/i);
    expect(sql).toMatch(/redacted_at is not null or old_value is distinct from new_value/i);
    expect(sql).toMatch(/revision_json_is_mobile_phone\(history\.old_value\)/i);
    expect(sql).toContain("retention_expired");
    expect(sql).toContain("data_subject_request");
    expect(sql).toMatch(/coalesce\(\s*member\.permission_role/i);
    expect(sql).toMatch(/v_approver_role not in \('owner', 'manager'\)/i);
    expect(sql).toMatch(/raise insufficient_privilege using message = 'owner_or_manager_required'/i);
    expect(sql).toMatch(/customer_revision_redaction_audit/i);
    expect(sql).toMatch(/approved_by_user_id uuid references public\.app_users\(id\) on delete set null/i);
    expect(sql).not.toMatch(/grant execute on function maju_private\.anonymize_customer_revision_values_for_request.*service_role/i);
    expect(sql).toMatch(/grant execute on function maju_private\.anonymize_customer_revision_values_for_request.*maju_revision_redaction_operator/i);
    expect(sql).toContain("maju_revision_redaction_operator_must_be_nologin");
    expect(sql).toContain("maju_revision_redaction_operator_must_have_no_members");
    expect(pg16Test).toContain("redaction_operator_has_members");
    expect(pg16Test).toContain("100_day_landline_not_redacted");
    expect(pg16Test).toContain("100_day_mobile_was_redacted");
    expect(pg16Test).toContain("exactly_90_day_landline_was_redacted");
    expect(pg16Test).toContain("89_day_landline_was_redacted");
    expect(pg16Test).toContain("other_company_was_redacted");
    expect(pg16Test).toContain("mixed_mobile_landline_row_was_redacted");
    expect(pg16Test).toContain("mobile_without_leading_zero_was_redacted");
    expect(pg16Test).toContain("member_should_be_forbidden");
    expect(pg16Test).toContain("service_role_spoofed_owner_should_be_forbidden");
    expect(pg16Test).toContain("legacy_owner_downgraded_to_staff_should_be_forbidden");
    expect(pg16Test).toContain("approval_snapshot_not_preserved_after_user_delete");
  });

  it("documents option A, option B, and reuse of the existing request functions", () => {
    expect(design).toContain("A. `matched_customer_id` 유지");
    expect(design).toContain("B. 공통 매장 ID");
    expect(design).toContain("requestPermitLeadAction");
    expect(design).toContain("requestPermitLeadConversion");
    expect(design).toMatch(/DNC.*읽기만/i);
  });
});
