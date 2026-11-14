
import { type StoreRow } from "@/components/map/map-row-helpers";
// 지도 상세·빠른 카드(map-place-detail)와 워크스페이스가 같이 쓰는 순수 타입·함수. 워크스페이스를 import하지 않는다(순환 import·TDZ 방지).
export type StoreEdit = Partial<
  Pick<
    StoreRow,
    | "accountCopyStatus"
    | "address"
    | "bankAccount"
    | "birthDate"
    | "businessCertificateStatus"
    | "businessRegistrationNumber"
    | "businessStatus"
    | "businessHours"
    | "accessMethodType"
    | "accessNote"
    | "accessPassword"
    | "deliveryArea"
    | "deliveryDriver"
    | "deliveryVehicleName"
    | "email"
    | "expectedRevenue"
    | "grade"
    | "industry"
    | "memo"
    | "menuSummary"
    | "name"
    | "openingDate"
    | "phone"
    | "relationshipStatus"
    | "representativeName"
    | "reviewSummary"
    | "reviewKeywords"
    | "reviewSource"
    | "status"
    | "updatedAt"
  >
>;

export type StoreHistoryItem = {
  id: string;
  memo: string;
  recordedAt: string;
};

export type StoreAttachment = {
  businessCertificate?: AttachmentFile;
  bankbookCopy?: AttachmentFile;
};

export type AttachmentFile = {
  dataUrl?: string;
  mediaType?: "file" | "image" | "video";
  name: string;
};

export type FuelPriceSummary = {
  basis: "opinet" | "fallback";
  checkedAt: string;
  pricePerLiter: number;
  sourceLabel: string;
};

export type FuelPriceByType = Record<"diesel" | "gasoline", FuelPriceSummary | null>;

// 거래처의 업종(industry) 값이 비어 있거나 "미분류"일 때, 이미 확보된 리뷰 키워드·리뷰 요약·메뉴
// 요약 텍스트에서 업종을 추정합니다. 정확한 값이 있으면 그걸 그대로 쓰고, 이건 어디까지나
// 마지막 보정 수단입니다(잘못 추정되면 사용자가 상세 화면에서 업종을 직접 입력해 덮어쓸 수 있음).
export const INDUSTRY_KEYWORD_RULES: Array<{ industry: string; keywords: string[] }> = [
  { industry: "곱창/막창", keywords: ["곱창", "막창", "대창"] },
  { industry: "고기/구이", keywords: ["삼겹살", "고깃집", "정육", "숯불", "구이"] },
  { industry: "분식", keywords: ["분식", "떡볶이", "김밥"] },
  { industry: "한식", keywords: ["한식", "백반", "국밥", "찌개", "한정식"] },
  { industry: "카페/디저트", keywords: ["카페", "커피", "디저트", "베이커리", "빵집"] },
  { industry: "일식", keywords: ["일식", "초밥", "스시", "라멘", "이자카야"] },
  { industry: "중식", keywords: ["중식", "짜장", "짬뽕", "마라"] },
  { industry: "양식", keywords: ["양식", "파스타", "스테이크", "피자"] },
  { industry: "주점", keywords: ["주점", "호프", "포차", "술집"] },
  { industry: "프랜차이즈/배달", keywords: ["치킨", "배달전문", "패스트푸드", "버거"] },
  { industry: "뷔페/단체급식", keywords: ["뷔페", "단체급식", "구내식당"] }
];

export function inferIndustryFromText(...texts: Array<string | undefined>): string | undefined {
  const haystack = texts.filter(Boolean).join(" ");
  if (!haystack) return undefined;
  const rule = INDUSTRY_KEYWORD_RULES.find((candidate) => candidate.keywords.some((keyword) => haystack.includes(keyword)));
  return rule?.industry;
}

/** 카드 뱃지·견적서 초안이 함께 쓰는 "실제로 보여줄 업종" 계산입니다. */
export function resolveDisplayIndustry(store: {
  industry?: string;
  menuSummary?: string;
  name?: string;
  reviewKeywords?: string[];
  reviewSummary?: string;
}): string {
  if (store.industry && store.industry !== "미분류") return store.industry;
  const inferred = inferIndustryFromText(store.menuSummary, store.reviewSummary, store.reviewKeywords?.join(" "), store.name);
  return inferred || store.industry || "미분류";
}

export function permitLeadCompanyId() {
  return typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") || "" : "";
}

export function withPermitLeadCompanyQuery(path: string) {
  const companyId = permitLeadCompanyId();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

// 휴대폰(010 등, 3-4-4)과 서울(02)/지역 번호를 입력 자릿수에 맞춰 실시간으로 하이픈 처리합니다.
export function normalizePhoneNumber(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 11);
}
