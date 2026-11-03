/**
 * 리드 DM 제안 문구 (11/3 현장 피드백 A3).
 * - 회사 기본 문구를 저장하고 매장별로 고쳐서 복사할 수 있습니다.
 * - 제외 품목(예: 육류)은 추천 품목 목록에서 뺍니다.
 * - 결제 조건은 고정 조건 대신 기본 '협의'로 씁니다.
 */
export const LEAD_DM_TEMPLATE_KEY = "lead_dm";
export const LEAD_DM_EXCLUDE_KEY = "lead_dm_exclude";
export const LEAD_DM_KEY_PREFIX = "lead_dm";

// 11/4: 단가표로 먼저 제안하고, 관심을 보이면 견적을 드리는 흐름. 줄을 나눠 읽기 쉽게.
export const DEFAULT_LEAD_DM_TEMPLATE = [
  "안녕하세요, {상호} 대표님.",
  "식자재를 납품하는 업체입니다.",
  "",
  "{업종} 매장에서 많이 쓰시는 {품목} 단가표를 먼저 보내드리고 싶습니다.",
  "지금 쓰시는 단가와 비교해 보시고, 관심 있는 품목이 있으면 맞춤 견적을 드리겠습니다.",
  "",
  "결제 조건은 협의해서 맞춰드립니다.",
  "편하게 답장 주세요."
].join("\n");

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
