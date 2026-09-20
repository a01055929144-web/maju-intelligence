import { normalizeKakaoCategoryIndustry } from "./leads";

export const KAKAO_INDUSTRY_BUCKETS = new Set([
  "한식",
  "카페/디저트",
  "일식",
  "중식",
  "프랜차이즈/배달",
  "주점",
  "양식",
  "뷔페/단체급식"
]);

export function resolveKakaoIndustryBackfill(currentValue: unknown): string | null {
  const current = typeof currentValue === "string" ? currentValue.trim() : "";
  if (!current || KAKAO_INDUSTRY_BUCKETS.has(current)) return null;
  const normalized = normalizeKakaoCategoryIndustry(current);
  return normalized !== current && KAKAO_INDUSTRY_BUCKETS.has(normalized) ? normalized : null;
}

export function hasCustomerKakaoIndustryEvidence(row: { kakao_place_url?: unknown; place_links_checked_at?: unknown }) {
  return Boolean(cleanText(row.kakao_place_url) || row.place_links_checked_at);
}

export function hasLeadKakaoIndustryEvidence(row: { kakao_place_url?: unknown; source?: unknown }) {
  return cleanText(row.source).toLowerCase().includes("kakao") || Boolean(cleanText(row.kakao_place_url));
}

export function replaceIndustryTag(tagsValue: unknown, current: string, normalized: string) {
  const tags = Array.isArray(tagsValue) ? tagsValue.map(cleanText).filter(Boolean) : [];
  return Array.from(new Set(tags.filter((tag) => tag !== current).concat(normalized)));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
