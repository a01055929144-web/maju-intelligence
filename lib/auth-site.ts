// CC-39 선결 조건: 관리자·운영 로그인이 한 브라우저에 함께 있을 때 API가 어느 범위로 처리할지 정한다.
export type MajuSite = "admin" | "company" | "store";

export function parseSite(value: string | null | undefined): MajuSite | null {
  return value === "admin" || value === "company" || value === "store" ? value : null;
}

/**
 * x-maju-site가 있으면 그 사이트의 세션을 쓴다(admin → 관리자, company → 운영).
 * 헤더가 없으면 지금 규칙(운영 우선)이되, 두 세션이 모두 있고 요청 companyId가 운영 세션 회사와 다르면 조용히 처리하지 않고 모호함으로 알린다.
 */
export function chooseScope(input: { site: MajuSite | null; hasAdmin: boolean; hasCustomer: boolean; requestedCompanyId?: string; customerCompanyId?: string }): "admin" | "customer" | "ambiguous" | "none" {
  const { site, hasAdmin, hasCustomer, requestedCompanyId, customerCompanyId } = input;
  if (!hasAdmin && !hasCustomer) return "none";
  if (hasAdmin && !hasCustomer) return "admin";
  if (!hasAdmin) return "customer";
  if (site === "admin") return "admin";
  if (site === "company") return "customer";
  return requestedCompanyId && requestedCompanyId !== customerCompanyId ? "ambiguous" : "customer";
}
