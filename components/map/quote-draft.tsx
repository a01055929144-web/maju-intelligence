"use client";

import {
  
  
  
  
  
  
  toCustomerQuoteLines,
  type QuoteLine,
} from "@/domains/quote/quote";
import {
  
  
  
  
  
  
  readLocalJson,
  
  
  saveLocalJson,
} from "@/lib/route-map-utils";
import { localStoreKeys, QUOTE_DRAFT_UPDATED_EVENT } from "@/components/map/local-store-keys";
// M8(45-3h): 견적 대상·임시저장 helper. 워크스페이스를 import하지 않는다.
export type QuoteSubject = {
  address?: string;
  customerId?: string;
  industry?: string;
  leadId?: string;
  menuNotes?: string;
  name: string;
  outboundNotes?: string[];
  phone?: string;
  reviewCount?: number;
  reviewKeywords?: string[];
  reviewSummary?: string;
  instagramUrl?: string;
};
export type QuoteDraft = {
  defaultMarginRate?: number;
  menuNotes: string;
  recommendationBasis?: string;
  recommendationCount?: 10 | 20 | 30;
  rows: QuoteLine[];
  savedAt: string;
  subject: QuoteSubject;
  validDays?: number;
  validUntil?: string;
};

// 업종별로 식자재 유통사가 통상 공급하는 품목 카테고리를 초안으로 깔아줍니다. 단가는 거래처마다
// 달라 0으로 비워두고, 담당자가 실제 협상가로 채워 넣는 것을 전제로 합니다(가짜 단가를 넣지 않음).
const INDUSTRY_QUOTE_TEMPLATES: Record<string, string[]> = {
  "한식": ["쌀 20kg", "돼지고기 앞다리살", "대파", "양파", "고춧가루", "식용유 18L", "국간장"],
  "고기/구이": ["삼겹살", "목살", "소고기(구이용)", "쌈채소 세트", "된장", "숯"],
  "곱창/막창": ["소곱창(손질)", "막창(손질)", "대창", "깻잎", "부추", "양념장 베이스"],
  "분식": ["떡볶이떡", "어묵", "튀김가루", "라면사리", "순대", "쫄면"],
  "카페/디저트": ["원두 1kg", "우유 1L", "생크림", "시럽류", "박력분 20kg", "일회용 컵"],
  "일식": ["초밥용 쌀 20kg", "간장 18L", "와사비", "김(초밥용)", "냉동 생선류", "무순"],
  "중식": ["면류(생면)", "굴소스", "두반장", "돼지고기 삼겹살", "청경채", "식용유 18L"],
  "프랜차이즈/배달": ["냉동육(닭/패티)", "튀김유 18L", "번/도우", "포장 용기", "소스류"],
  "주점": ["안주용 육류", "건어물", "채소 세트", "음료·주류 부재료"],
  "양식": ["파스타면", "올리브유", "치즈류", "육류(스테이크용)", "토마토소스"],
  "뷔페/단체급식": ["쌀 20kg (대량)", "육류 세트", "채소 세트(대량)", "국·찌개용 육수", "일회용품"]
};

export function buildQuoteDraftRows(industry?: string, marginRate = 10): QuoteLine[] {
  const items = (industry && INDUSTRY_QUOTE_TEMPLATES[industry]) || [];
  return items.map((item, index) => ({
    id: `draft-${index}`,
    item,
    marginRate,
    matchStatus: "unmatched",
    purchasePrice: 0,
    qty: 1,
    spec: "",
    unit: "",
    unitPrice: 0
  }));
}

export function normalizeQuoteRows(rows: QuoteDraft["rows"] | Array<Partial<QuoteLine> & { id: string; item: string }>, marginRate = 10): QuoteLine[] {
  return rows.map((row) => ({
    id: row.id,
    item: row.item,
    marginRate: typeof row.marginRate === "number" ? row.marginRate : marginRate,
    matchStatus: row.matchStatus || "unmatched",
    purchasePrice: typeof row.purchasePrice === "number" ? row.purchasePrice : 0,
    qty: typeof row.qty === "number" ? row.qty : 1,
    requestPhotoName: row.requestPhotoName,
    spec: row.spec || "",
    unit: row.unit || "",
    unitPrice: typeof row.unitPrice === "number" ? row.unitPrice : 0
  }));
}

export function quoteDraftId(subject: QuoteSubject) {
  return subject.leadId || subject.customerId || subject.name;
}

export function readQuoteDraft(subject: QuoteSubject): QuoteDraft | null {
  const drafts = readLocalJson<Record<string, QuoteDraft>>(localStoreKeys.quoteDrafts, {});
  const draft = drafts[quoteDraftId(subject)];
  if (!draft || !Array.isArray(draft.rows)) return null;
  return { ...draft, rows: normalizeQuoteRows(draft.rows, draft.defaultMarginRate || 12) };
}

export function saveQuoteDraftToLocal(subject: QuoteSubject, draft: QuoteDraft) {
  const drafts = readLocalJson<Record<string, QuoteDraft>>(localStoreKeys.quoteDrafts, {});
  saveLocalJson(localStoreKeys.quoteDrafts, { ...drafts, [quoteDraftId(subject)]: draft });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUOTE_DRAFT_UPDATED_EVENT, { detail: { id: quoteDraftId(subject) } }));
}

export function deleteQuoteDraftFromLocal(subject: QuoteSubject) {
  const drafts = readLocalJson<Record<string, QuoteDraft>>(localStoreKeys.quoteDrafts, {});
  const next = { ...drafts };
  delete next[quoteDraftId(subject)];
  saveLocalJson(localStoreKeys.quoteDrafts, next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUOTE_DRAFT_UPDATED_EVENT, { detail: { id: quoteDraftId(subject) } }));
}


export function buildQuoteShareText(companyName: string, subject: QuoteSubject, rows: QuoteLine[], menuNotes: string, total: number, validUntil?: string) {
  const items = toCustomerQuoteLines(rows)
    .slice(0, 8)
    .map((row, index) => {
      const detailText = [row.spec, row.unit].filter(Boolean).join(" / ");
      const qtyText = row.qty > 1 ? ` · ${row.qty}${row.unit || "개"}` : "";
      const priceText = row.unitPrice ? ` · ${row.unitPrice.toLocaleString()}원` : "";
      return `${index + 1}. ${row.item}${detailText ? ` (${detailText})` : ""}${qtyText}${priceText}`;
    })
    .join("\n");
  return [
    `[${companyName}] ${subject.name} 납품 제안`,
    subject.industry ? `업종: ${subject.industry}` : "",
    subject.address ? `주소: ${subject.address}` : "",
    subject.phone ? `연락처: ${subject.phone}` : "",
    menuNotes ? `메모: ${menuNotes}` : "",
    "",
    "추천 품목",
    items || "- 품목을 추가해주세요.",
    "",
    total ? `합계 약 ${total.toLocaleString()}원` : "단가는 상담 후 안내드립니다.",
    validUntil ? `견적 유효기간: ${new Date(validUntil).toLocaleDateString("ko-KR")}까지` : "",
    "",
    "확인해보시고 편하게 연락 주세요."
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildOutboundItemNotes(industry?: string) {
  const rows = buildQuoteDraftRows(industry);
  if (!rows.length) return ["업종 확인 후 주력 품목 5개 선정", "현재 사용 단가표 확인", "월 사용량 기준 견적 작성"];
  return rows.slice(0, 5).map((row) => row.item);
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
