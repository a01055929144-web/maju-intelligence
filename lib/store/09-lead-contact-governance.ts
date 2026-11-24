import type { LeadContactChannel } from "../../domains/lead/contact-channels";
import { getPermitLeadIdentityForCompany } from "../store";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

export const LEAD_DNC_WRITE_ENABLED = process.env.LEAD_DNC_WRITE_ENABLED === "true";

export type ActiveLeadDoNotContact = {
  blockedAt: string;
  channel: LeadContactChannel;
  dncId: string;
  maskedValue: string;
};

export async function listActiveLeadDoNotContacts(companyId: string, leadId: string): Promise<ActiveLeadDoNotContact[]> {
  if (!isProductionStoreConfigured()) return [];
  type DncRow = {
    blocked_at: string;
    channel: LeadContactChannel;
    id: string;
    masked_value: string;
  };
  const rows = await supabaseRequest<DncRow[]>("rpc/list_active_lead_do_not_contacts", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId, p_lead_id: leadId })
  });
  return rows.map((row) => ({
      blockedAt: row.blocked_at,
      channel: row.channel,
      dncId: row.id,
      maskedValue: row.masked_value
    }));
}

export async function registerLeadDoNotContact(input: {
  actorName?: string;
  actorUserId?: string;
  channel: "sms" | "instagram" | "talktalk" | "email" | "fax" | "visit";
  companyId: string;
  leadId: string;
  normalizedValue: string;
  reason?: string;
}): Promise<boolean> {
  if (!LEAD_DNC_WRITE_ENABLED) throw new Error("연락 거부 원자 저장 기능이 아직 활성화되지 않았습니다.");
  const rows = await supabaseRequest<boolean>("rpc/register_lead_do_not_contact", {
    method: "POST",
    body: JSON.stringify({
      p_actor_name: input.actorName || null,
      p_actor_user_id: input.actorUserId || null,
      p_channel: input.channel,
      p_company_id: input.companyId,
      p_lead_id: input.leadId,
      p_contact_value: input.normalizedValue,
      p_reason: input.reason || "연락 거부"
    })
  });
  return rows === true;
}

export async function releaseLeadDoNotContact(input: {
  actorKind: "app_user" | "legacy_owner";
  actorName?: string;
  actorUserId?: string;
  companyId: string;
  dncId: string;
  releaseReason: string;
}): Promise<boolean> {
  if (!LEAD_DNC_WRITE_ENABLED) throw new Error("연락 거부 원자 저장 기능이 아직 활성화되지 않았습니다.");
  const rows = await supabaseRequest<boolean>("rpc/release_lead_do_not_contact", {
    method: "POST",
    body: JSON.stringify({
      p_actor_kind: input.actorKind,
      p_actor_name: input.actorName || null,
      p_actor_user_id: input.actorUserId || null,
      p_company_id: input.companyId,
      p_dnc_id: input.dncId,
      p_release_reason: input.releaseReason
    })
  });
  return rows === true;
}

export async function listLeadContactFieldSources(companyId: string, leadId: string) {
  if (!isProductionStoreConfigured()) return [];
  return supabaseRequest<Array<{ collected_at: string; field_name: string; source_type: string }>>(
    `lead_contact_field_sources?select=field_name,source_type,collected_at&company_id=eq.${encodeURIComponent(companyId)}&lead_id=eq.${encodeURIComponent(leadId)}&order=collected_at.desc`
  );
}

export const LEAD_FIELD_SOURCE_WRITE_ENABLED = process.env.LEAD_FIELD_SOURCE_WRITE_ENABLED === "true";

export async function recordLeadContactFieldSource(input: {
  collectedAt?: string;
  companyId: string;
  fieldName: "phone" | "email" | "fax" | "instagram_url" | "naver_talktalk_url" | "address" | "business_name";
  leadId: string;
  recordedBy?: string;
  sourceReference?: string;
  sourceType: "kakao" | "permit" | "manual" | "upload" | "naver_homepage" | "google" | "other";
}) {
  if (!LEAD_FIELD_SOURCE_WRITE_ENABLED) throw new Error("칸별 출처 쓰기가 아직 활성화되지 않았습니다.");
  const lead = await getPermitLeadIdentityForCompany(input.companyId, input.leadId);
  if (!lead) return false;
  const rows = await supabaseRequest<Array<{ id: string }>>("lead_contact_field_sources?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      collected_at: input.collectedAt || new Date().toISOString(),
      company_id: input.companyId,
      field_name: input.fieldName,
      lead_id: input.leadId,
      recorded_by: input.recordedBy || null,
      source_reference: input.sourceReference || null,
      source_type: input.sourceType
    })
  });
  return Boolean(rows[0]?.id);
}

/** 인스타 후보 찾기 등 한 리드의 기본 정보만 필요할 때 씁니다. 다른 회사 리드는 돌려주지 않습니다. */
