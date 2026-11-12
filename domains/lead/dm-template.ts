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

export type LeadDmTarget = "restaurant" | "distributor";
export type LeadDmVars = {
  businessName: string; industry: string; items: string[];
  /** CC-31: 보내는 회사 이름·리드 시군구(없으면 회사 영업 지역)·회사 주력 품목·{지역} 최근 30일 신규 음식점 수. 안 주면 그 변수가 든 줄은 빠진다. */
  companyName?: string; region?: string; mainItems?: string; newCount?: number;
  /** distributor면 {업종}·{품목}은 무시(그 줄 생략). */
  target?: LeadDmTarget;
};

/**
 * CC-31: 값이 빈 변수가 든 줄은 통째로 뺀다("미분류 매장에서…" 같은 어색한 문장 방지). 줄이 빠져 생긴 연속 빈 줄은 하나로 줄인다.
 * 이전에는 {업종}이 비면 "음식점", {품목}이 비면 "주요"로 채웠다 — 지시서(CC-31)에 따라 그 줄을 생략한다.
 */
export function renderLeadDm(template: string, input: LeadDmVars) {
  const distributor = input.target === "distributor";
  const values: Record<string, string> = {
    "{상호}": input.businessName.trim(),
    "{회사명}": input.companyName?.trim() || "",
    "{지역}": input.region?.trim() || "",
    "{업종}": distributor ? "" : input.industry.trim(),
    "{품목}": distributor ? "" : input.items.join(", "),
    "{주력품목}": input.mainItems?.trim() || "",
    "{신규수}": input.newCount && input.newCount > 0 ? String(input.newCount) : "",
  };
  const lines: string[] = [];
  for (const line of (template.trim() || DEFAULT_LEAD_DM_TEMPLATE).split("\n")) {
    const used = Object.keys(values).filter((key) => line.includes(key));
    if (used.some((key) => !values[key])) continue;
    lines.push(used.reduce((text, key) => text.replaceAll(key, values[key]), line));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function validateLeadDmTemplate(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "문구를 입력해 주세요.";
  if (trimmed.length > 1000) return "문구는 1,000자 이하로 입력해 주세요.";
  return "";
}

// CC-31: 기본 템플릿 3개씩(코드에 고정). 회사는 하나를 골라 고쳐 회사 문구로 저장한다. 키: 매장 lead_dm(기존), 유통사 lead_dm_distributor.
export const LEAD_DM_DISTRIBUTOR_KEY = "lead_dm_distributor";
export type LeadDmTemplate = { id: string; name: string; body: string };
const t = (...lines: string[]) => lines.join("\n");
export const LEAD_DM_TEMPLATES: Record<LeadDmTarget, LeadDmTemplate[]> = {
  restaurant: [
    { id: "S1", name: "단가표 먼저", body: t("안녕하세요, {상호} 대표님.", "{지역}에서 식자재를 납품하는 {회사명}입니다.", "", "{업종} 매장에서 많이 쓰시는 {품목} 단가표를 먼저 보내드리고 싶습니다.", "지금 쓰시는 단가와 비교해 보시고, 관심 있는 품목이 있으면 맞춤 견적을 드리겠습니다.", "", "결제 조건은 협의해서 맞춰드립니다.", "편하게 답장 주세요.") },
    { id: "S2", name: "신규 오픈 축하", body: t("{상호} 대표님, 오픈 준비 중이시죠?", "{지역} 식자재 납품 {회사명}입니다.", "", "오픈 초기에는 품목·수량이 자주 바뀌어서, 소량·당일 주문이 되는 곳이 편합니다.", "{주력품목} 위주로 단가표를 먼저 드리고, 링크에서 바로 주문하실 수 있게 해 드릴게요.", "", "단가표 받아 보시겠어요?") },
    { id: "S3", name: "비교 견적", body: t("{상호} 대표님, {회사명}입니다.", "", "지금 쓰시는 거래처 단가표를 사진으로 보내주시면,", "같은 품목으로 비교 견적을 하루 안에 드립니다.", "바꾸지 않으셔도 괜찮습니다. 비교만 해 보세요.") },
  ],
  distributor: [
    { id: "D1", name: "공급 제안", body: t("안녕하세요, {상호} 대표님.", "{주력품목} 공급하는 {회사명}입니다.", "", "{지역} 유통사에 안정적인 물량과 도매 단가로 공급하고 있습니다.", "단가표를 먼저 보내드리고, 필요하신 품목은 샘플도 드리겠습니다.", "", "편하게 답장 주세요.") },
    { id: "D2", name: "결품·단가 대응", body: t("{상호} 대표님, {회사명}입니다.", "", "결품이나 단가 급등 때 바로 대체 공급이 필요하시면 연락 주세요.", "{주력품목}은 당일·익일 출고가 가능합니다.", "", "이번 주 도매 단가표 보내드릴까요?") },
    { id: "D3", name: "거래 조건", body: t("{상호} 대표님, {회사명}입니다.", "", "정기 물량 기준으로 단가와 결제 조건을 맞춰드립니다.", "지금 받으시는 조건을 알려주시면 비교 조건을 바로 드리겠습니다.") },
  ],
};
