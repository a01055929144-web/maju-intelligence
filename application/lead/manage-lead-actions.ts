import type { LeadActionRepository, LeadActionType } from "@/domains/lead/lead-action";
import { normalizeLeadActionLimit } from "@/domains/lead/lead-action";

export function recordLeadContact(
  repository: LeadActionRepository,
  companyId: string,
  leadId: string,
  input: { actionType: LeadActionType; actorName: string; memo?: string; result?: string }
) {
  if (!companyId || !leadId) throw new Error("회사와 리드 정보가 필요합니다.");
  return repository.record(companyId, leadId, input);
}

export function listLeadContacts(repository: LeadActionRepository, companyId: string, leadId: string, limit?: number) {
  if (!companyId || !leadId) throw new Error("회사와 리드 정보가 필요합니다.");
  return repository.list(companyId, leadId, normalizeLeadActionLimit(limit));
}
