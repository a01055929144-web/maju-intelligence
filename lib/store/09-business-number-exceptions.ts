import { normalizeBusinessNumber } from "../business-number";
import type { AuditActorContext } from "../store";
import { writeAdminAuditLog } from "../store";
import { getDefaultCompanyId, isProductionStoreConfigured, supabaseRequest } from "./00-core";

export type BusinessNumberException = {
  id: string;
  businessRegistrationNumber: string;
  memo: string;
  createdAt: string;
};

function isMissingBusinessNumberExceptionsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("business_number_exceptions");
}

/**
 * 하나의 사업자등록번호(종사업자번호 등)로 여러 거래처를 운영하는 회사를 위한 예외 목록입니다.
 * 이 목록에 등록된 사업자번호는 데이터 등록/업로드 시 normalized_key를 사업자번호 대신
 * 상호명+주소 기준으로 계산해, 서로 다른 거래처가 같은 레코드로 병합되거나 중복으로
 * 잘못 경고되지 않도록 합니다. getExemptBusinessNumberSet()과 함께 사용하세요.
 */
export async function getBusinessNumberExceptions(companyId: string): Promise<{ exceptions: BusinessNumberException[]; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return { exceptions: [], persisted: false };

  try {
    const rows = await supabaseRequest<Array<{ id: string; business_registration_number: string; memo: string | null; created_at: string }>>(
      `business_number_exceptions?select=id,business_registration_number,memo,created_at&company_id=eq.${encodeURIComponent(
        companyId
      )}&order=created_at.desc`
    );
    return {
      persisted: true,
      exceptions: rows.map((row) => ({
        id: row.id,
        businessRegistrationNumber: row.business_registration_number,
        memo: row.memo || "",
        createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      }))
    };
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) return { exceptions: [], persisted: false };
    throw error;
  }
}

/** normalized_key 계산에서 businessNumber || ... 폴백을 우회해야 할 사업자번호 집합만 가볍게 가져옵니다. */
export async function getExemptBusinessNumberSet(companyId?: string): Promise<Set<string>> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return new Set();

  try {
    const rows = await supabaseRequest<Array<{ business_registration_number: string }>>(
      `business_number_exceptions?select=business_registration_number&company_id=eq.${encodeURIComponent(id)}`
    );
    return new Set(rows.map((row) => normalizeBusinessNumber(row.business_registration_number)));
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) return new Set();
    throw error;
  }
}

export async function addBusinessNumberException(
  companyId: string,
  businessRegistrationNumber: string,
  memo: string,
  auditContext: AuditActorContext = {}
): Promise<{ exception: BusinessNumberException; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  const businessNumber = normalizeBusinessNumber(businessRegistrationNumber || "");
  if (!businessNumber) throw new Error("사업자등록번호를 입력하세요.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      exception: {
        id: globalThis.crypto.randomUUID(),
        businessRegistrationNumber: businessNumber,
        memo: memo.trim(),
        createdAt: "서버 저장 미확인"
      }
    };
  }

  try {
    const rows = await supabaseRequest<Array<{ id: string; business_registration_number: string; memo: string | null; created_at: string }>>(
      "business_number_exceptions?on_conflict=company_id,business_registration_number",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([
          {
            company_id: companyId,
            business_registration_number: businessNumber,
            memo: memo.trim() || null,
            created_by: auditContext.actorName || "시스템"
          }
        ])
      }
    );
    const row = rows[0];
    const exception: BusinessNumberException = {
      id: row.id,
      businessRegistrationNumber: row.business_registration_number,
      memo: row.memo || "",
      createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    };

    await writeAdminAuditLog({
      companyId,
      action: "business_number_exception_created",
      targetType: "business_number_exception",
      targetId: exception.id,
      metadata: {
        actorName: auditContext.actorName || "시스템",
        actorRole: auditContext.actorRole || "unknown",
        businessRegistrationNumber: exception.businessRegistrationNumber
      }
    }).catch(() => null);

    return { persisted: true, exception };
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) {
      throw new Error(
        "중복 허용 사업자번호를 저장할 수 없습니다. Supabase에 business_number_exceptions 테이블이 아직 없습니다. supabase/migrations/20260814_business_number_exceptions.sql을 먼저 실행하세요."
      );
    }
    throw error;
  }
}

export async function removeBusinessNumberException(companyId: string, exceptionId: string, auditContext: AuditActorContext = {}): Promise<void> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!exceptionId) throw new Error("삭제할 항목 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return;

  await supabaseRequest(`business_number_exceptions?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(exceptionId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  await writeAdminAuditLog({
    companyId,
    action: "business_number_exception_removed",
    targetType: "business_number_exception",
    targetId: exceptionId,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown"
    }
  }).catch(() => null);
}
