import { DEFAULT_STAFF_JOB_TITLES, type CompanyJobTitle } from "../staff-job-titles";
import type { AuditActorContext } from "../store";
import { writeAdminAuditLog } from "../store";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

function isMissingCompanyJobTitlesTableError(error: unknown) {
  return error instanceof Error && error.message.includes("company_job_titles");
}

/**
 * 회사가 직접 추가한 커스텀 담당 업무(직원 역할 표시용) 목록입니다. 기본 4개(배송기사/영업직원/
 * 현장관리자/일반직원)는 여기 포함되지 않고 화면 쪽에서 DEFAULT_STAFF_JOB_TITLES와 합쳐 보여줍니다.
 */
export async function getCompanyJobTitles(companyId: string): Promise<{ jobTitles: CompanyJobTitle[]; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return { jobTitles: [], persisted: false };

  try {
    const rows = await supabaseRequest<Array<{ id: string; label: string; created_at: string }>>(
      `company_job_titles?select=id,label,created_at&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.asc`
    );
    return {
      persisted: true,
      jobTitles: rows.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      }))
    };
  } catch (error) {
    if (isMissingCompanyJobTitlesTableError(error)) return { jobTitles: [], persisted: false };
    throw error;
  }
}

export async function addCompanyJobTitle(
  companyId: string,
  label: string,
  auditContext: AuditActorContext = {}
): Promise<{ jobTitle: CompanyJobTitle; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  const trimmed = (label || "").trim();
  if (!trimmed) throw new Error("담당 업무 이름을 입력하세요.");
  if (DEFAULT_STAFF_JOB_TITLES.some((option) => option.label === trimmed)) {
    throw new Error("이미 기본 제공되는 이름입니다. 다른 이름을 입력하세요.");
  }

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      jobTitle: { id: globalThis.crypto.randomUUID(), label: trimmed, createdAt: "서버 저장 미확인" }
    };
  }

  try {
    const rows = await supabaseRequest<Array<{ id: string; label: string; created_at: string }>>(
      "company_job_titles?on_conflict=company_id,label",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{ company_id: companyId, label: trimmed, created_by: auditContext.actorName || "시스템" }])
      }
    );
    const row = rows[0];
    const jobTitle: CompanyJobTitle = {
      id: row.id,
      label: row.label,
      createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    };

    await writeAdminAuditLog({
      companyId,
      action: "company_job_title_created",
      targetType: "company_job_title",
      targetId: jobTitle.id,
      metadata: { actorName: auditContext.actorName || "시스템", actorRole: auditContext.actorRole || "unknown", label: jobTitle.label }
    }).catch(() => null);

    return { persisted: true, jobTitle };
  } catch (error) {
    if (isMissingCompanyJobTitlesTableError(error)) {
      throw new Error(
        "담당 업무 이름을 저장할 수 없습니다. Supabase에 company_job_titles 테이블이 아직 없습니다. supabase/migrations/20260907b_company_job_titles.sql을 먼저 실행하세요."
      );
    }
    throw error;
  }
}

export async function removeCompanyJobTitle(companyId: string, jobTitleId: string, auditContext: AuditActorContext = {}): Promise<void> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!jobTitleId) throw new Error("삭제할 항목 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return;

  await supabaseRequest(`company_job_titles?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(jobTitleId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  await writeAdminAuditLog({
    companyId,
    action: "company_job_title_removed",
    targetType: "company_job_title",
    targetId: jobTitleId,
    metadata: { actorName: auditContext.actorName || "시스템", actorRole: auditContext.actorRole || "unknown" }
  }).catch(() => null);
}
