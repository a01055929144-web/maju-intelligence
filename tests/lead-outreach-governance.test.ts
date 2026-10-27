import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLeadSourceDisclosure,
  leadSourceLabel,
  normalizeDoNotContactValue,
  requiresAfterHoursConfirmation
} from "../domains/lead/outreach-governance";

describe("lead outreach governance", () => {
  it("explains known lead sources without overstating collection details", () => {
    expect(leadSourceLabel("kakao_keyword_search")).toBe("카카오 장소 검색");
    expect(buildLeadSourceDisclosure({ businessName: "면볶당", collectedAt: "2026-10-27T01:00:00.000Z", source: "localdata_api" })).toContain(
      "지방행정 인허가 공개데이터에서 2026. 10. 27. 확인했습니다"
    );
    expect(leadSourceLabel("unknown")).toBe("확인 중인 공개·직접 수집 정보");
  });

  it("requires confirmation during the Seoul quiet hours", () => {
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T12:00:00.000Z"))).toBe(true); // 21:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T22:59:00.000Z"))).toBe(true); // 07:59 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T23:00:00.000Z"))).toBe(false); // 08:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T11:59:00.000Z"))).toBe(false); // 20:59 KST
  });

  it("normalizes contact values for a company do-not-contact registry", () => {
    expect(normalizeDoNotContactValue("sms", "10-3306-4790")).toBe("01033064790");
    expect(normalizeDoNotContactValue("email", "MAILTO:Owner@Example.COM")).toBe("owner@example.com");
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/My.Shop/")).toBe("my.shop");
    expect(normalizeDoNotContactValue("talktalk", "HTTPS://TALK.NAVER.COM/ct/ABC/")).toBe("https://talk.naver.com/ct/abc");
  });

  it("requires a confirmed audit row before reporting source disclosure success", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    expect(storeSource).toContain('Array<{ id: string }>>("lead_actions?select=id"');
    expect(storeSource).toContain('Prefer: "return=representation"');
    expect(storeSource).toContain('if (!rows[0]?.id) throw new Error("출처 안내 감사 기록 저장을 확인하지 못했습니다.")');
  });

  it("keeps tenant ownership and direct client access controls in the SQL draft", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "docs/sql-drafts/lead-contact-governance.sql"), "utf8");
    expect(sql).toContain("key_columns.columns = array['company_id', 'id']::name[]");
    expect(sql).not.toContain("business_permit_leads_company_id_id_unique");
    expect(sql).toContain("foreign key (company_id, lead_id)");
    expect(sql).toContain("foreign key (company_id, source_lead_id)");
    expect(sql.match(/enable row level security/g)).toHaveLength(3);
    expect(sql.match(/from public, anon, authenticated/g)).toHaveLength(3);
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("create table"));
    expect(sql.lastIndexOf("commit;")).toBeGreaterThan(sql.lastIndexOf("grant select"));
    expect(sql).toContain("user_id uuid references public.app_users(id) on delete cascade");
    expect(sql).toContain("actor_kind in ('app_user','legacy_owner')");
    expect(sql).toContain("actor_subject = 'legacy_owner:' || company_id::text");
    expect(sql).toContain("unique (company_id, actor_subject, policy_version)");
  });

  it("records the applied SQL as a non-rerunnable migration without enabling features", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261026223510_lead_contact_governance_20261027.sql"), "utf8");
    expect(migration).toContain("schema_migrations version=20261026223510, name=lead_contact_governance_20261027. 재실행 금지.");
    expect(migration).toContain("연락 거부 등록·칸별 출처 쓰기는 전용 원자 처리 승인 전 금지한다.");
    expect(migration.match(/enable row level security/g)).toHaveLength(3);
    expect(migration.match(/from public, anon, authenticated/g)).toHaveLength(3);
  });

  it("records source disclosure before writing to the clipboard", () => {
    const panel = fs.readFileSync(path.join(process.cwd(), "components/lead-contact-channels-panel.tsx"), "utf8");
    const disclosureHandler = panel.slice(panel.indexOf("async function copySourceDisclosure"), panel.indexOf("function confirmAfterHoursSms"));
    expect(disclosureHandler.indexOf("fetchWithTimeout")).toBeLessThan(disclosureHandler.indexOf("navigator.clipboard.writeText"));
    expect(disclosureHandler).toContain("출처 안내 기록을 남기지 못해 문구를 복사하지 않았습니다.");
    expect(disclosureHandler).toContain("if (recordingSourceDisclosure) return");
    expect(disclosureHandler).toContain("setRecordingSourceDisclosure(false)");
  });

  it("keeps active contact refusals excluded when leads are reingested", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    expect(storeSource).toContain("company_do_not_contact?select=channel,normalized_value,source_lead_id");
    expect(storeSource).toContain("const isContactBlocked = Boolean");
    expect(storeSource).toContain('status: isContactBlocked ? "제외"');
    expect(storeSource).toContain('exclude_reason: isContactBlocked');
  });

  it("supports first-use policy acknowledgement for app users and legacy owners", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/leads/outreach-policy/route.ts"), "utf8");
    const panel = fs.readFileSync(path.join(process.cwd(), "components/lead-contact-channels-panel.tsx"), "utf8");
    expect(route).toContain('actorKind: "legacy_owner"');
    expect(route).toContain('actorSubject: `legacy_owner:${scope.companyId}`');
    expect(route).toContain("acknowledgeSalesOutreachPolicy");
    expect(panel).toContain('aria-modal="true"');
    expect(panel).toContain("확인하고 영업 시작");
  });

  it("keeps DNC writes disabled until the atomic RPC is approved", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    const route = fs.readFileSync(path.join(process.cwd(), "app/api/leads/permits/[id]/do-not-contact/route.ts"), "utf8");
    const sql = fs.readFileSync(path.join(process.cwd(), "docs/sql-drafts/lead-do-not-contact-rpc.sql"), "utf8");
    expect(storeSource).toContain('process.env.LEAD_DNC_WRITE_ENABLED === "true"');
    expect(route).toContain("if (!LEAD_DNC_WRITE_ENABLED)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.register_lead_do_not_contact");
    expect(sql).toContain("grant execute on function public.register_lead_do_not_contact");
    expect(sql).toContain("action_type,result,memo,actor_name,metadata");
    expect(sql).not.toContain("actor_name, actor_user_id)");
    expect(sql).toContain("'exclude','제외'");
    expect(sql).toContain("'actor_user_id', p_actor_user_id");
    expect(sql).not.toContain("'normalized_value',");
    expect(sql).toContain("'masked_value',v_masked");
    expect(sql).toContain("do nothing returning id into v_dnc_id");
    expect(sql).toContain("status='active'");
    expect(sql).toContain("regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_normalized");
    expect(sql).toContain("create or replace function public.release_lead_do_not_contact");
    expect(sql).toContain("owner_or_manager_required");
    expect(sql).toContain("release_reason_required");
    expect(sql).toContain("contact_value_not_on_lead");
    expect(sql).toContain("status not in ('거래처 전환','기존 거래처')");
    expect(sql).toContain("legacy_owner 세션은 app_users/company_members 행이 없어 이 RPC로 해제할 수 없다");
    expect(sql).toContain("left(v_normalized,3)||'-****-'||right(v_normalized,4)");
    expect(sql).toContain("'before_status',before_status");
    expect(sql).toContain("'before_exclude_reason',before_exclude_reason");
    expect(sql).toContain("lead.status='제외' and lead.exclude_reason='연락 거부 등록'");
    expect(sql).toContain("exclude_reason=original_change.metadata->>'before_exclude_reason'");
    expect(sql).toContain("'changed_status',(affected.id is not null)");
    expect(sql).toContain("metadata->>'changed_status'='true'");
    expect(sql).toContain("order by lead_id,created_at asc");
    expect(sql).toContain("not (status='제외' and exclude_reason='연락 거부 등록')");
    expect(sql).toContain("other_dnc.released_at is null");
    expect(sql).toContain("other_dnc.id::text=other_action.metadata->>'dnc_id'");
    expect(sql).not.toContain("metadata->>'dnc_id')::uuid");
    expect(sql).toContain("with impacted as");
    expect(sql).toContain("join impacted on impacted.lead_id=action.lead_id");
    expect(sql).toContain("action.metadata->>'changed_status'='true'");
    expect(sql).toContain("coalesce(permission_role,role) in ('owner','manager')");
    expect(route).toContain('scope.customerSession?.workspaceRole !== "owner"');
  });

  it("reads field-level sources through a company-scoped server boundary", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    expect(storeSource).toContain("lead_contact_field_sources?select=field_name,source_type,collected_at&company_id=eq.${encodeURIComponent(companyId)}&lead_id=eq.${encodeURIComponent(leadId)}");
    expect(storeSource).toContain('process.env.LEAD_FIELD_SOURCE_WRITE_ENABLED === "true"');
    expect(storeSource).toContain("const lead = await getPermitLeadIdentityForCompany(input.companyId, input.leadId)");
  });
});
