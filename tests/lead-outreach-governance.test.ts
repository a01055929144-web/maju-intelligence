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
    expect(normalizeDoNotContactValue("fax", "02-555-1234")).toBe("025551234");
    expect(normalizeDoNotContactValue("email", "MAILTO:Owner@Example.COM")).toBe("owner@example.com");
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/My.Shop/")).toBe("my.shop");
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/My.Shop/?igsh=abc")).toBe("my.shop");
    expect(normalizeDoNotContactValue("instagram", "@My.Shop")).toBe("my.shop");
    expect(normalizeDoNotContactValue("instagram", "@bad?igsh=abc")).toBeNull();
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/reel/abc")).toBeNull();
    expect(normalizeDoNotContactValue("talktalk", "HTTPS://TALK.NAVER.COM/ct/ABC/")).toBe("https://talk.naver.com/ct/abc");
    expect(normalizeDoNotContactValue("visit", "  Store Door  ")).toBe("store door");
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
    expect(route).toContain("return NextResponse.json({ canRelease, enabled: false, entries: [] })");
    expect(route).toContain('const canRelease = Boolean(scope.customerSession && ["owner", "manager"].includes(scope.customerSession.workspaceRole))');
    expect(route).toContain("listActiveLeadDoNotContacts(scope.companyId!, (await params).id)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.register_lead_do_not_contact");
    expect(sql).toContain("grant execute on function public.register_lead_do_not_contact");
    expect(sql).toContain("action_type,result,memo,actor_name,metadata");
    expect(sql).not.toContain("actor_name, actor_user_id)");
    expect(sql).toContain("'exclude','제외'");
    expect(sql).toMatch(/'actor_user_id'\s*,\s*p_actor_user_id/);
    expect(sql).not.toMatch(/'normalized_value'\s*,\s*(?:p_contact_value|v_normalized)/);
    expect(sql).not.toMatch(/jsonb_build_object\([^;]*\b(?:p_contact_value|v_normalized)\b[^;]*\)/s);
    expect(sql).toMatch(/'masked_value'\s*,\s*v_masked/);
    expect(sql).toContain("do nothing returning id into v_dnc_id");
    expect(sql).toContain("status='active'");
    expect(sql).toContain("create or replace function public.normalize_dnc_value");
    expect(sql).toContain("candidate ~ '^[A-Za-z0-9._]{1,30}$'");
    expect(sql).toContain("lower(candidate) not in ('p','reel','explore','accounts','stories')");
    expect(sql).toContain("when 'sms' then phone when 'fax' then fax");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':dnc:'");
    expect(sql).toContain("create or replace function public.release_lead_do_not_contact");
    expect(sql).toContain("owner_or_manager_required");
    expect(sql).toContain("release_reason_required");
    expect(sql).toContain("contact_value_not_on_lead");
    expect(sql).toContain("status not in ('거래처 전환','기존 거래처','제외')");
    expect(sql).toContain("p_actor_kind is null or p_actor_kind not in ('app_user','legacy_owner')");
    expect(sql).toContain("legacy owner는 활성 legacy credential/company 연결을 DNC 전용 helper로 매 요청 재검증");
    expect(sql).toContain("p_actor_kind='legacy_owner'");
    expect(sql).toContain("legacy_owner_user_id_must_be_null");
    expect(sql).toContain("status in ('active','fallback')");
    expect(sql).toContain("join public.app_users app_user on app_user.id=member.user_id and app_user.status='active'");
    expect(sql).toContain("v_masked := public.mask_dnc_value(p_channel, v_normalized)");
    expect(sql).toContain("when length(coalesce(p_value, '')) < 7 then '***'");
    expect(sql).toContain("'before_status',before_status");
    expect(sql).not.toContain("'before_next_action'");
    expect(sql).not.toContain("'before_exclude_reason'");
    expect(sql).toContain("lead.status='제외' and lead.exclude_reason='연락 거부 등록'");
    expect(sql).toContain("next_action=null,exclude_reason=null");
    expect(sql).toContain("'changed_status',(affected.id is not null)");
    expect(sql).toContain("metadata->>'changed_status'='true'");
    expect(sql).toMatch(/order by\s+(?:action\.)?lead_id\s*,\s*(?:action\.)?created_at\s+asc/);
    expect(sql).toContain("other_dnc.released_at is null");
    expect(sql).toContain("other_dnc.id::text=other_action.metadata->>'dnc_id'");
    expect(sql).not.toContain("metadata->>'dnc_id')::uuid");
    expect(sql).toContain("with impacted as");
    expect(sql).toMatch(/from\s+impacted\s+left join\s+public\.lead_actions\s+action/);
    expect(sql).toContain("action.metadata->>'changed_status'='true'");
    expect(sql).toContain("action.metadata->>'restored_status'='true'");
    expect(sql).toContain("action.created_at>cycle_start.last_restored_at");
    expect(sql).toContain("'restored_status',(restored.id is not null)");
    expect(sql).toContain("from impacted left join restored on restored.id=impacted.lead_id");
    expect(sql).toMatch(/coalesce\((?:member\.)?permission_role\s*,\s*(?:member\.)?role\)\s+in\s+\('owner','manager'\)/);
    expect(route).toContain("if (!scope.ok || !scope.customerSession)");
    expect(route).toContain('["owner", "manager"].includes(scope.customerSession.workspaceRole)');
    expect(route).toContain('!scope.customerSession.userId && scope.customerSession.workspaceRole !== "owner"');
    expect(route).toContain('const actorKind = scope.customerSession.userId ? "app_user" : "legacy_owner"');
    expect(route).toContain("companyId: scope.companyId!");
    expect(storeSource).toContain('p_actor_kind: input.actorKind');
    expect(storeSource).toContain('rpc/release_lead_do_not_contact');
    expect(storeSource).toContain("company_do_not_contact?select=id,channel,normalized_value,source_lead_id,blocked_at");
    expect(storeSource).toContain("maskedValue: maskDoNotContactValue(row.channel, row.normalized_value)");
    expect(route).toContain("await isActiveLegacyOwnerSession({");
    expect(route).toContain("email: scope.customerSession.email");
    expect(route).toContain("}).catch(() => false)");
    expect(storeSource).toContain("auth_credentials?select=customer_company_id,customer_email&customer_company_id=eq.${encodeURIComponent(input.companyId)}");
    expect(storeSource).toContain('return Boolean(companyRows[0] && ["active", "fallback"].includes(companyRows[0].status || ""))');
    const panel = fs.readFileSync(path.join(process.cwd(), "components/lead-contact-channels-panel.tsx"), "utf8");
    expect(panel).toContain("운영 승인 전 비활성화됨");
    expect(panel).toContain('reason: "상대방 요청"');
    expect(panel).toContain('method: "DELETE"');
    expect(panel).toContain("window.prompt(\"연락 거부 해제 사유를 입력해 주세요.\")");
    expect(panel).not.toContain("normalizedValue");
  });

  it("reads field-level sources through a company-scoped server boundary", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    expect(storeSource).toContain("lead_contact_field_sources?select=field_name,source_type,collected_at&company_id=eq.${encodeURIComponent(companyId)}&lead_id=eq.${encodeURIComponent(leadId)}");
    expect(storeSource).toContain('process.env.LEAD_FIELD_SOURCE_WRITE_ENABLED === "true"');
    expect(storeSource).toContain("const lead = await getPermitLeadIdentityForCompany(input.companyId, input.leadId)");
  });
});
