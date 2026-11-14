import { getPermitLeadOpenDate } from "@/domains/lead/map-filters";
import type { PermitLeadItem } from "@/lib/store";

export type LeadListSortKey = "default" | "name" | "industry" | "openDate" | "grade";
export const LEAD_LIST_SORT_OPTIONS: Array<{ label: string; value: LeadListSortKey }> = [
  { label: "기본 순", value: "default" },
  { label: "상호명", value: "name" },
  { label: "업종", value: "industry" },
  { label: "인허가일", value: "openDate" },
  { label: "등급", value: "grade" }
];

/** 오른쪽 리드 목록 정렬. 값이 없는 리드(업종 미분류·개업일 미확인·채점 전)는 방향과 상관없이 맨 뒤에 둡니다. */
export function sortLeadList<T extends Pick<PermitLeadItem, "businessName" | "grade" | "industryPrimary" | "openDate" | "permitDate">>(
  leads: T[],
  key: LeadListSortKey,
  direction: "asc" | "desc"
): T[] {
  if (key === "default") return leads;
  const valueOf = (lead: T): string => {
    if (key === "name") return (lead.businessName || "").trim();
    if (key === "industry") return (lead.industryPrimary || "").trim();
    if (key === "openDate") return getPermitLeadOpenDate(lead);
    return (lead.grade || "").trim().toUpperCase();
  };
  const sign = direction === "asc" ? 1 : -1;
  return [...leads].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return sign * left.localeCompare(right, "ko", { numeric: true, sensitivity: "base" });
  });
}
