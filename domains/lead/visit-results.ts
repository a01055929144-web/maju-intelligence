import type { LeadActionType } from "@/domains/lead/lead-action";

export const STANDARD_VISIT_RESULTS = ["부재", "관심", "단가표 전달", "재방문 예정", "거래 시작", "거절"] as const;

export type StandardVisitResult = (typeof STANDARD_VISIT_RESULTS)[number];

export const VISIT_RESULT_ACTION_TYPE: Record<StandardVisitResult, LeadActionType> = {
  부재: "visit",
  관심: "visit",
  "단가표 전달": "visit",
  "재방문 예정": "visit",
  "거래 시작": "visit",
  거절: "exclude"
};

export const VISIT_RESULTS_REQUIRING_FOLLOW_UP = new Set<StandardVisitResult>(["관심", "단가표 전달", "재방문 예정"]);

const LEGACY_VISIT_RESULT_LABELS: Record<string, string> = {
  "관심 있음": "관심",
  "견적 요청": "단가표 요청",
  "다음 방문": "재방문 예정",
  "재연락 예정": "재방문 예정",
  "통화 성공": "연락 완료",
  보류: "추후 검토"
};

export function getVisitResultDisplayLabel(result?: string | null) {
  const value = result?.trim();
  if (!value) return "영업 기록";
  return LEGACY_VISIT_RESULT_LABELS[value] || value;
}

export function needsVisitFollowUp(result: string): result is StandardVisitResult {
  return VISIT_RESULTS_REQUIRING_FOLLOW_UP.has(result as StandardVisitResult);
}

export function getDefaultVisitFollowUpDate(base = new Date()) {
  const date = new Date(base);
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}
