import { digitsOnly, extractInstagramHandle, type LeadContactChannel } from "./contact-channels";

export const SALES_OUTREACH_POLICY_VERSION = "2026-10-27-v1";

export const SALES_OUTREACH_RULES = [
  "매장별 상황에 맞는 1:1 제안만 보냅니다.",
  "21:00~08:00에는 문자 발송을 피합니다.",
  "연락처 출처를 물으면 확인된 사실만 안내합니다.",
  "연락 거부 의사를 밝히면 즉시 영업을 중단합니다.",
  "다수에게 같은 광고를 보낼 때는 (광고)와 수신거부 방법을 표시합니다.",
  "수집한 정보는 영업 목적 외에는 사용하지 않습니다."
] as const;

export type LeadSourceDisclosureInput = {
  businessName: string;
  collectedAt?: string;
  source?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  gov_restaurant_api: "전국 공공데이터",
  kakao_keyword_search: "카카오 장소 검색",
  localdata_api: "지방행정 인허가 공개데이터",
  manual_upload: "고객사가 직접 올린 파일",
  seoul_opendata_api: "서울시 공공데이터"
};

export function leadSourceLabel(source?: string): string {
  return (source && SOURCE_LABELS[source]) || "확인 중인 공개·직접 수집 정보";
}

export function buildLeadSourceDisclosure(input: LeadSourceDisclosureInput): string {
  const captured = input.collectedAt
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(input.collectedAt))
    : "수집일 확인 중";
  return `${input.businessName} 매장 정보는 ${leadSourceLabel(input.source)}에서 ${captured} 확인했습니다. 공개된 영업 정보의 출처를 사실대로 안내드리며, 연락을 원하지 않으시면 즉시 중단하겠습니다.`;
}

export function seoulHourAt(date: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  return Number(hour || 0) % 24;
}

export function requiresAfterHoursConfirmation(date = new Date()): boolean {
  const hour = seoulHourAt(date);
  return hour >= 21 || hour < 8;
}

export function normalizeDoNotContactValue(channel: LeadContactChannel, value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (channel === "sms" || channel === "fax") {
    const digits = digitsOnly(raw);
    return digits ? (/^10\d{8}$/.test(digits) ? `0${digits}` : digits) : null;
  }
  if (channel === "instagram") return extractInstagramHandle(raw)?.toLowerCase() || null;
  if (channel === "email") return raw.replace(/^mailto:/i, "").toLowerCase();
  if (channel === "talktalk") return raw.replace(/\/$/, "").toLowerCase();
  return raw.toLowerCase();
}
