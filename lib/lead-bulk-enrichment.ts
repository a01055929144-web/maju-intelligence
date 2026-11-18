import type { LeadBulkJob, LeadBulkJobItem } from "@/domains/lead/bulk-enrichment";
import type { LeadBulkRepository } from "@/application/lead/run-bulk-enrichment";
import { discoverInstagramCandidates } from "@/lib/instagram-discovery";
import { enrichPermitLeadExternalInfo, getPermitLeadIdentityForCompany, supabaseRequest } from "@/lib/store";

type JobRow = {
  id: string; company_id: string; action: LeadBulkJob["action"]; status: LeadBulkJob["status"];
  total_items: number; succeeded_items: number; failed_items: number; cancel_requested_at: string | null;
};
type ItemRow = { id: string; job_id: string; company_id: string; lead_id: string; action: LeadBulkJob["action"] };

const job = (row: JobRow): LeadBulkJob => ({
  id: row.id, companyId: row.company_id, action: row.action, status: row.status, totalItems: row.total_items,
  succeededItems: row.succeeded_items, failedItems: row.failed_items, cancelRequestedAt: row.cancel_requested_at
});
const item = (row: ItemRow): LeadBulkJobItem => ({
  id: row.id, jobId: row.job_id, companyId: row.company_id, leadId: row.lead_id, action: row.action
});

export const leadBulkRepository: LeadBulkRepository = {
  async createJob(input) {
    const row = await supabaseRequest<JobRow>("rpc/create_lead_bulk_enrichment_job", { method: "POST", body: JSON.stringify({
      p_company_id: input.companyId, p_action: input.action, p_lead_ids: input.leadIds,
      p_idempotency_key: input.idempotencyKey, p_actor_name: input.actorName
    }) });
    return job(row);
  },
  async getJob(companyId, jobId) {
    const rows = await supabaseRequest<JobRow[]>(`lead_bulk_enrichment_jobs?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(jobId)}&select=*&limit=1`);
    return rows[0] ? job(rows[0]) : null;
  },
  async claimNext(companyId, jobId, dailyCap) {
    const row = await supabaseRequest<ItemRow | null>("rpc/claim_lead_bulk_enrichment_item", { method: "POST", body: JSON.stringify({
      p_company_id: companyId, p_job_id: jobId, p_daily_cap: dailyCap
    }) });
    return row ? item(row) : null;
  },
  async completeItem(value, outcome) {
    await supabaseRequest("rpc/complete_lead_bulk_enrichment_item", { method: "POST", body: JSON.stringify({
      p_company_id: value.companyId, p_item_id: value.id, p_ok: outcome.ok,
      p_result: outcome.ok ? outcome.result : {}, p_error: outcome.ok ? null : outcome.error
    }) });
  },
  async requestCancel(companyId, jobId) {
    return job(await supabaseRequest<JobRow>("rpc/cancel_lead_bulk_enrichment_job", { method: "POST", body: JSON.stringify({
      p_company_id: companyId, p_job_id: jobId
    }) }));
  },
  async retryFailed(companyId, jobId) {
    return job(await supabaseRequest<JobRow>("rpc/retry_lead_bulk_enrichment_failures", { method: "POST", body: JSON.stringify({
      p_company_id: companyId, p_job_id: jobId
    }) }));
  }
};

export async function executeLeadBulkItem(value: LeadBulkJobItem) {
  if (value.action !== "instagram_candidates") {
    return enrichPermitLeadExternalInfo(value.companyId, value.leadId, { source: "manual", trigger: "manual" });
  }
  const lead = await getPermitLeadIdentityForCompany(value.companyId, value.leadId);
  if (!lead) throw new Error("리드를 찾을 수 없습니다.");
  // 후보는 작업 결과 JSON에만 저장한다. 리드 확정 칸과 발송 경로는 호출하지 않는다.
  return discoverInstagramCandidates({ businessName: lead.businessName, address: lead.address, industry: lead.industry });
}

