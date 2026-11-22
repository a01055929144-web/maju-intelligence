// D-6 ①: 지도 파일에서 분리한 리드 도우미 함수·상수(순수 계산, 동작 변화 0).
// 옛 경로(components/sales-route-map-workspace)에서 같은 이름으로 다시 내보낸다.
import { DEFAULT_LEAD_DM_TEMPLATE, LEAD_DM_TEMPLATES, filterDmItems, parseExcludedItems, renderLeadDm } from "@/domains/lead/dm-template";
import type { LeadOpenDateFilterMode, PermitLeadType } from "@/domains/lead/map-filters";
import { buildOutboundItemNotes, type QuoteSubject } from "@/components/map/quote-draft";
import type { PermitLeadItem, PermitLeadPeriod } from "@/lib/store";

export type PermitLeadActionIntent = "call" | "dm" | "followup" | "info" | "";

export function normalizeLeadSearchToken(value: string) {
  return value.toLowerCase().replace(/[@._\-\s]/g, "");
}

export function normalizeInstagramHandleValue(value: string | undefined) {
  const rawValue = (value || "").trim();
  if (!rawValue) return "";

  const urlMatch = rawValue.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch?.[1]) {
    const handle = decodeURIComponent(urlMatch[1]).replace(/^@/, "").trim();
    const reservedPaths = new Set(["accounts", "direct", "explore", "p", "reel", "reels", "stories"]);
    if (!handle || reservedPaths.has(handle.toLowerCase())) return "";
    return `@${handle}`;
  }

  const plainValue = rawValue.replace(/^@/, "").trim();
  if (/^[a-z0-9._]{2,30}$/i.test(plainValue)) return `@${plainValue}`;
  return "";
}

export function getLeadInstagramHandle(lead: PermitLeadItem) {
  return normalizeInstagramHandleValue(lead.instagramUrl);
}

// 2026-08-24 피드백("인스타 id 검색이 잘 안되고 있어")의 원인: 예전에는 실제 저장된 인스타 ID가
// 없는 리드도 상호명에서 글자만 뽑아 "@추정아이디"를 만들어 표시/검색에 썼습니다. 이 추정값은
// 실제 계정과 무관해서, 사용자가 진짜 아이디로 검색해도 안 걸리고, 클릭해도 엉뚱한(혹은 존재하지
// 않는) 계정으로 연결되는 문제가 있었습니다. 이제 실제로 저장된 ID만 "확인됨"으로 표시/검색하고,
// 없으면 명확히 "검색 필요" 상태로 보여줍니다.
export function getLeadInstagramSearchUrl(lead: PermitLeadItem) {
  const handle = getLeadInstagramHandle(lead);
  if (handle) return `https://www.instagram.com/${encodeURIComponent(handle.replace(/^@/, ""))}/`;
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent([lead.businessName, lead.address].filter(Boolean).join(" "))}`;
}

export function getLeadInstagramSearchTokens(lead: PermitLeadItem) {
  const handle = getLeadInstagramHandle(lead);
  if (!handle) return [];
  return [lead.instagramUrl || "", handle, handle.replace(/^@/, ""), normalizeLeadSearchToken(handle)].filter(Boolean);
}

export function permitLeadActionLabel(actionType: string) {
  if (actionType === "call") return "전화";
  if (actionType === "dm") return "인스타 DM";
  if (actionType === "sms") return "문자";
  if (actionType === "talktalk") return "네이버 톡톡";
  if (actionType === "email") return "이메일";
  if (actionType === "fax") return "팩스";
  if (actionType === "status") return "상태 변경";
  if (actionType === "visit") return "방문";
  if (actionType === "hold") return "보류";
  if (actionType === "exclude") return "제외";
  if (actionType === "quote") return "견적 요청";
  if (actionType === "convert") return "거래처 전환";
  return actionType;
}

/** 11/3 A3: 회사 기본 문구(placeholder {상호}{업종}{품목})와 제외 품목을 반영합니다. 결제 조건 기본값은 '협의'. */
export type LeadDmSettings = { excluded?: string; template?: string; distributorTemplate?: string; context?: { companyName?: string; region?: string; mainItems?: string; newCount?: number } };
export function buildLeadDmScript(lead: PermitLeadItem, settings?: LeadDmSettings) {
  // CC-31: 유통사 리드는 유통사용 회사 문구(없으면 코드 기본 D1)를 쓰고 {업종}·{품목}은 무시한다. 매장 리드는 기존 그대로.
  const distributor = lead.targetType === "distributor";
  const items = distributor ? [] : filterDmItems(buildOutboundItemNotes(lead.industryPrimary), parseExcludedItems(settings?.excluded || "")).slice(0, 4);
  const template = distributor ? settings?.distributorTemplate || LEAD_DM_TEMPLATES.distributor[0].body : settings?.template || DEFAULT_LEAD_DM_TEMPLATE;
  return renderLeadDm(template, { businessName: lead.businessName, industry: lead.industryPrimary, items, target: distributor ? "distributor" : "restaurant", ...settings?.context });
}


export function getPermitLeadTableAction(lead: PermitLeadItem): { intent: PermitLeadActionIntent; label: string; mode: "detail" | "quote"; primary: boolean } {
  if (lead.status === "견적 발송" || lead.status === "재연락 예정") return { intent: "followup", label: "후속 기록", mode: "detail", primary: true };
  if (lead.status === "견적 요청") return { intent: "", label: "견적 작성", mode: "quote", primary: true };
  if (lead.nextAction === "오늘 바로 전화") return { intent: "call", label: "통화 기록", mode: "detail", primary: true };
  if (lead.nextAction === "오늘 DM 발송") return { intent: "dm", label: "DM 기록", mode: "detail", primary: true };
  if (lead.nextAction === "정보 보강") return { intent: "info", label: "정보 확인", mode: "detail", primary: false };
  return { intent: "", label: "상세 보기", mode: "detail", primary: false };
}

export function getPermitLeadQuoteSubject(lead: PermitLeadItem): QuoteSubject {
  return {
    address: lead.address,
    industry: lead.industryPrimary,
    instagramUrl: lead.instagramUrl,
    leadId: lead.id,
    name: lead.businessName,
    outboundNotes: buildOutboundItemNotes(lead.industryPrimary),
    phone: lead.phone,
    reviewCount: lead.reviewCount
  };
}

// 2026-08-28 피드백 대응(아직 점수 계산 안 된 리드가 그냥 낮은 등급으로 보임): 리뷰수·평점·검색량
// 보강이 한 번도 실행되지 않은 리드는 grade가 null이라도 "실제로 낮은 등급"이 아니라 "아직 채점
// 전"입니다. 세 값이 모두 없으면(0도 아니고 아예 미기록) 보강 전으로 간주합니다.
export const PERMIT_PERIOD_OPTIONS: Array<{ label: string; value: "all" | PermitLeadPeriod }> = [
  { label: "전체 기간", value: "all" },
  { label: "오늘 신규", value: "today" },
  { label: "이번 주 신규", value: "week" },
  { label: "이번 달 신규", value: "month" },
  { label: "최근 90일", value: "recent" }
];
export const PERMIT_PERIOD_BADGE_LABEL: Record<PermitLeadPeriod, string> = {
  today: "오늘 신규",
  week: "이번 주 신규",
  month: "이번 달 신규",
  recent: "최근 90일"
};
export const PERMIT_ACTION_OPTIONS = ["오늘 바로 전화", "오늘 DM 발송", "전화·DM 검토", "정보 보강", "제외 검토"];

export function isPermitLeadUnscored(lead: Pick<PermitLeadItem, "reviewCount" | "rating" | "keywordVolume">) {
  return lead.reviewCount == null && lead.rating == null && lead.keywordVolume == null;
}

export const PERMIT_LEAD_TYPE_LABEL: Record<PermitLeadType, string> = {
  new: "신규리드",
  sales: "영업리드"
};
export const PERMIT_LEAD_TYPE_DESCRIPTION: Record<PermitLeadType, string> = {
  new: "개업일이 최근 90일 이내로 확인된 신생 사업자 리드입니다.",
  sales: "개업일은 확인되지 않지만, 검색량·리뷰 등 활동 지표를 기준으로 영업 타겟팅하는 리드입니다."
};

export function formatLeadOpenDateFilterLabel(mode: LeadOpenDateFilterMode, year: string, month: string, startDate: string, endDate: string) {
  if (mode === "all") return "개시일 전체";
  if (mode === "missing") return "개시일 미확인";
  if (mode === "year") return year ? `${year}년 개시` : "연도 선택 필요";
  if (mode === "month") return month ? `${month} 개시` : "월 선택 필요";
  if (!startDate && !endDate) return "직접 기간";
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return `${startDate} 이후`;
  return `${endDate} 이전`;
}
