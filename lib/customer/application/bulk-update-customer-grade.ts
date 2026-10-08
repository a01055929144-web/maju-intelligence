import { requireCustomerGradeOverride, type CustomerGradeOverride } from "../domain/customer-grade";

export type BulkCustomerGradeUpdateResult = {
  requested: number;
  updated: number;
  updatedIds: string[];
};

export interface CustomerGradeRepository {
  bulkUpdateGrade(companyId: string, customerIds: string[], grade: CustomerGradeOverride): Promise<BulkCustomerGradeUpdateResult>;
}

export async function bulkUpdateCustomerGrade(
  repository: CustomerGradeRepository,
  input: { companyId: string; customerIds: string[]; grade: unknown }
): Promise<BulkCustomerGradeUpdateResult> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("회사 정보를 확인할 수 없습니다.");

  const customerIds = Array.from(
    new Set(input.customerIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean))
  );
  if (!customerIds.length) throw new Error("선택된 거래처가 없습니다.");

  const grade = requireCustomerGradeOverride(input.grade);
  return repository.bulkUpdateGrade(companyId, customerIds, grade);
}
