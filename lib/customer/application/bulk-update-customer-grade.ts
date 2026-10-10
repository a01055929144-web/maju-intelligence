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
  const result = await repository.bulkUpdateGrade(companyId, customerIds, grade);
  const requestedIdSet = new Set(customerIds);
  const updatedIds = Array.from(
    new Set(result.updatedIds.filter((id) => typeof id === "string" && requestedIdSet.has(id)))
  );

  // 저장소 응답을 그대로 신뢰하면 다른 회사/다른 요청의 id가 섞인 잘못된 응답으로 화면 상태가
  // 갱신될 수 있습니다. 요청한 id의 교집합만 반환하고 개수도 그 결과에서 다시 계산합니다.
  return { requested: customerIds.length, updated: updatedIds.length, updatedIds };
}
