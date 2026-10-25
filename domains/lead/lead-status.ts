// 리드 상태(영업 단계) 규칙. 2026-10-25 대표 요청: 상태는 언제든 사용자가 직접 바꿀 수 있어야 한다.
// 저장값은 기존 business_permit_leads.status 문자열을 그대로 쓰고(데이터 이전 없음),
// 화면에는 공통 영업 단계 이름(신규 → 연락함 → 견적 전달 → 협의·재연락 → 계약 / 보류 / 거절)으로 보여 줍니다.

export type LeadStageOption = { value: string; label: string };

export const LEAD_STAGE_OPTIONS: readonly LeadStageOption[] = [
  { value: "신규 수집", label: "신규" },
  { value: "연락 완료", label: "연락함" },
  { value: "견적 발송", label: "견적 전달" },
  { value: "재연락 예정", label: "협의·재연락" },
  { value: "전환 진행", label: "계약" },
  { value: "검토 필요", label: "보류" },
  { value: "제외", label: "거절·제외" }
];

const SELECTABLE = new Set(LEAD_STAGE_OPTIONS.map((option) => option.value));

export function isSelectableLeadStatus(value: string | null | undefined): value is string {
  return Boolean(value && SELECTABLE.has(value));
}

const LEGACY_STATUS_TO_STAGE: Record<string, string> = {
  "전화 대상": "신규 수집",
  "DM 대상": "신규 수집",
  "방문 대상": "신규 수집",
  "DM 발송": "연락 완료",
  "문자 발송": "연락 완료",
  "톡톡 발송": "연락 완료",
  "이메일 발송": "연락 완료",
  "팩스 발송": "연락 완료",
  "견적 요청": "견적 발송",
  "미팅 예정": "재연락 예정"
};

/** 저장된 상태값(예전 값 포함)을 공통 단계 저장값으로 맞춥니다. 모르는 값(주인 변경·임시 영업 등)은 그대로 둡니다. */
export function toLeadStageValue(status: string | null | undefined): string {
  const value = String(status || "").trim();
  if (SELECTABLE.has(value)) return value;
  return LEGACY_STATUS_TO_STAGE[value] || value;
}

export function leadStageLabel(status: string | null | undefined): string {
  const stageValue = toLeadStageValue(status);
  return LEAD_STAGE_OPTIONS.find((option) => option.value === stageValue)?.label || stageValue || "신규";
}
