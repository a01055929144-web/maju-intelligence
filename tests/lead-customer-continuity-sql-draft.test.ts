import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("docs/sql-drafts/20261029-lead-customer-continuity.sql", "utf8");
const design = readFileSync("docs/specs/2026-10-29-lead-customer-continuity-and-retention.md", "utf8");

describe("lead to customer continuity SQL draft", () => {
  it("keeps the rollout disabled and company scoped", () => {
    expect(sql).toContain("LEAD_CUSTOMER_CONTINUITY_ENABLED=false");
    expect(sql).toMatch(/if not p_rollout_enabled then/i);
    expect(sql).toMatch(/lead\.company_id = p_company_id/i);
    expect(sql).toMatch(/customer\.company_id = p_company_id/i);
    expect(sql).toMatch(/security invoker/i);
  });

  it("fills only empty customer fields and preserves the matched customer link", () => {
    expect(sql).toMatch(/coalesce\(nullif\(customer\.phone, ''\)/i);
    expect(sql).toMatch(/coalesce\(nullif\(customer\.fax, ''\)/i);
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
    expect(sql).toContain("retention_expired");
    expect(sql).toContain("data_subject_request");
    expect(sql).toMatch(/revoke all on function maju_private\.anonymize_customer_revision_values_for_request.*service_role/i);
  });

  it("documents option A, option B, and reuse of the existing request functions", () => {
    expect(design).toContain("A. `matched_customer_id` 유지");
    expect(design).toContain("B. 공통 매장 ID");
    expect(design).toContain("requestPermitLeadAction");
    expect(design).toContain("requestPermitLeadConversion");
    expect(design).toMatch(/DNC.*읽기만/i);
  });
});
