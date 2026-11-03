/**
 * 리드 DM 제안 문구 (11/3 현장 피드백 A3).
 * - 회사 기본 문구를 저장하고 매장별로 고쳐서 복사할 수 있습니다.
 * - 제외 품목(예: 육류)은 추천 품목 목록에서 뺍니다.
 * - 결제 조건은 고정 조건 대신 기본 '협의'로 씁니다.
 */
export const LEAD_DM_TEMPLATE_KEY = "lead_dm";
export const LEAD_DM_EXCLUDE_KEY = "lead_dm_exclude";
export const LEAD_DM_KEY_PREFIX = "lead_dm";

export const DEFAULT_LEAD_DM_TEMPLATE =
  "안녕하세요, {상호} 대표님. 식자재 납품·단가 비교를 제안드리고 싶어 연락드립니다. {업종} 업종 기준으로 {품목} 품목을 먼저 맞춰보고, 현재 쓰시는 품목과 비교 견적을 간단히 정리해드릴 수 있습니다. 결제 조건은 협의해서 맞춰드립니다. 괜찮으시면 메뉴판이나 주력 메뉴 기준으로 1차 제안서 보내드리겠습니다.";

export function parseExcludedItems(value: string) {
  return value.split(/[,\n·]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

export function filterDmItems(items: string[], excluded: string[]) {
  if (!excluded.length) return items;
  return items.filter((item) => !excluded.some((word) => item.includes(word)));
}

export function renderLeadDm(template: string, input: { businessName: string; industry: string; items: string[] }) {
  const items = input.items.length ? input.items.join(", ") : "주요";
  return (template.trim() || DEFAULT_LEAD_DM_TEMPLATE)
    .replaceAll("{상호}", input.businessName)
    .replaceAll("{업종}", input.industry || "음식점")
    .replaceAll("{품목}", items);
}

export function validateLeadDmTemplate(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "문구를 입력해 주세요.";
  if (trimmed.length > 1000) return "문구는 1,000자 이하로 입력해 주세요.";
  return "";
}
