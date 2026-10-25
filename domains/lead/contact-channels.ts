// 리드 영업 채널(문자·인스타 DM·네이버 톡톡·이메일·팩스·방문) 도메인 규칙입니다.
// React·Supabase를 모르는 순수 함수만 둡니다(CLAUDE.md 11-2).
//
// 2026-10-25 대표 결정:
// - 010(사장님 휴대폰)이 1순위. 매장 유선 번호(02·031·070 등) 콜드콜은 영업 흐름에서 뺀다.
// - 휴대폰이 없으면 인스타그램 DM·네이버 톡톡, 그다음 이메일·팩스, 마지막이 방문.
// - 인스타그램·네이버 톡톡은 외부 발송 API가 없으므로(먼저 메시지를 보낸 사람에게만 답장 가능)
//   "프로필/톡톡 열기 + 문구 복사 + 보냈음 기록"으로 처리한다.

export type LeadContactChannel = "sms" | "instagram" | "talktalk" | "email" | "fax" | "visit";

export const LEAD_CONTACT_CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  sms: "문자",
  instagram: "인스타 DM",
  talktalk: "네이버 톡톡",
  email: "이메일",
  fax: "팩스",
  visit: "방문"
};

/** 실제 연락으로 세는 lead_actions.action_type 목록(성과 집계용). 보류·제외는 연락이 아닙니다. */
export const LEAD_CONTACT_ACTION_TYPES = ["call", "dm", "visit", "quote", "sms", "talktalk", "email", "fax"] as const;

export function isLeadContactActionType(actionType: string): boolean {
  return (LEAD_CONTACT_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

/** 010 휴대폰 번호인지 판단합니다. 앞자리 0이 빠진 10자리(1012345678)도 휴대폰으로 봅니다. */
export function isMobilePhoneNumber(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (/^010\d{8}$/.test(digits)) return true;
  return /^10\d{8}$/.test(digits);
}

/** 화면 표시용 전화·팩스 번호 형식. 형식을 모르면 원문 그대로 둡니다. */
export function formatKoreanPhoneNumber(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  let digits = digitsOnly(raw);
  if (/^10\d{8}$/.test(digits)) digits = `0${digits}`;
  if (/^010\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (/^02\d{7,8}$/.test(digits)) return digits.length === 9 ? `02-${digits.slice(2, 5)}-${digits.slice(5)}` : `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (/^0\d{2}\d{7,8}$/.test(digits)) return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (/^1[568]\d{6}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return raw;
}

export type NormalizedContactResult = { ok: true; value: string | null } | { ok: false; message: string };

/** 팩스 번호 저장값 정리. 빈 값은 삭제(null), 국내 번호 형식이 아니면 거부합니다. */
export function normalizeFaxNumberInput(value: string | null | undefined): NormalizedContactResult {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const digits = digitsOnly(raw);
  if (!/^0\d{8,10}$/.test(digits) && !/^1[568]\d{6}$/.test(digits)) {
    return { ok: false, message: "팩스 번호 형식을 확인해 주세요. 예: 02-555-1234" };
  }
  return { ok: true, value: formatKoreanPhoneNumber(digits) };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmailInput(value: string | null | undefined): NormalizedContactResult {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const lowered = raw.replace(/^mailto:/i, "").toLowerCase();
  if (lowered.length > 254 || !EMAIL_PATTERN.test(lowered)) {
    return { ok: false, message: "이메일 주소 형식을 확인해 주세요. 예: owner@example.com" };
  }
  return { ok: true, value: lowered };
}

/**
 * 네이버 톡톡 주소 정리. talk.naver.com/ 주소(또는 그 뒤의 계정 id만) 받아 https 주소로 저장합니다.
 * 네이버 플레이스·지도 주소는 톡톡 주소가 아니므로 거부합니다(톡톡 버튼에서 연 주소를 붙여 넣도록 안내).
 */
export function normalizeNaverTalktalkInput(value: string | null | undefined): NormalizedContactResult {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const urlMatch = raw.match(/^(?:https?:\/\/)?(?:m\.)?talk\.naver\.com\/(?:ct\/)?([A-Za-z0-9_-]{3,64})(?:[/?#].*)?$/i);
  if (urlMatch) return { ok: true, value: `https://talk.naver.com/ct/${urlMatch[1]}` };
  if (/naver\.(?:com|me)/i.test(raw)) {
    return { ok: false, message: "네이버 플레이스 주소가 아니라 톡톡 창 주소(talk.naver.com/…)를 붙여 넣어 주세요." };
  }
  if (/^[A-Za-z0-9_-]{3,64}$/.test(raw)) return { ok: true, value: `https://talk.naver.com/ct/${raw}` };
  return { ok: false, message: "톡톡 주소 형식을 확인해 주세요. 예: https://talk.naver.com/ct/w4abcd" };
}

/** 인스타그램 핸들(아이디)을 URL·@표기 어느 쪽이든 받아 아이디만 돌려줍니다. */
export function extractInstagramHandle(value: string | null | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const fromUrl = raw.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i)?.[1];
  const handle = (fromUrl || raw).replace(/^@/, "").replace(/\/$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return undefined;
  if (["p", "reel", "explore", "accounts", "stories"].includes(handle.toLowerCase())) return undefined;
  return handle;
}

/** 인스타그램 DM 창을 바로 여는 주소(휴대폰은 인스타 앱, PC는 웹 DM). */
export function buildInstagramDmUrl(handle: string): string {
  return `https://ig.me/m/${encodeURIComponent(handle)}`;
}

/** 톡톡 주소가 없을 때 네이버 지도에서 매장을 찾아 톡톡 버튼을 누를 수 있게 하는 검색 주소. */
export function buildNaverMapSearchUrl(businessName: string, address?: string | null): string {
  const area = String(address || "")
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  return `https://map.naver.com/p/search/${encodeURIComponent(`${businessName} ${area}`.trim())}`;
}

export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** 휴대폰 기본 문자 앱을 문구가 채워진 상태로 엽니다(iOS·Android 모두 `?&body=` 형식이 동작). */
export function buildSmsUrl(phone: string, body: string): string {
  return `sms:${digitsOnly(phone)}?&body=${encodeURIComponent(body)}`;
}

export type LeadMessageVariables = {
  businessName: string;
  companyName?: string;
  staffName?: string;
  staffPhone?: string;
  priceSheetUrl?: string;
};

/** 문구의 {상호}·{회사명}·{담당자명}·{담당자 연락처}·{단가표 링크}를 채웁니다. 값이 없는 변수는 지웁니다. */
export function fillLeadMessageTemplate(template: string, variables: LeadMessageVariables): string {
  const map: Record<string, string> = {
    상호: variables.businessName,
    회사명: variables.companyName || "",
    담당자명: variables.staffName || "",
    "담당자 연락처": variables.staffPhone || "",
    "단가표 링크": variables.priceSheetUrl || ""
  };
  return template
    .replace(/\{([^{}]+)\}/g, (match, key: string) => (key in map ? map[key] : match))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type LeadChannelSource = {
  phone?: string | null;
  mobilePhone?: string | null;
  instagramUrl?: string | null;
  naverTalktalkUrl?: string | null;
  email?: string | null;
  fax?: string | null;
};

export type LeadChannelAvailability = {
  channel: LeadContactChannel;
  label: string;
  value?: string;
  available: boolean;
};

/**
 * 영업 채널 우선순위: 문자(010) → 인스타 DM → 네이버 톡톡 → 이메일 → 팩스 → 방문.
 * 매장 유선 번호는 콜드콜 채널이 아니므로 순위에 넣지 않습니다(화면에는 참고로만 표시).
 */
export function resolveLeadContactChannels(source: LeadChannelSource): LeadChannelAvailability[] {
  const mobile = [source.mobilePhone, source.phone].find((value) => isMobilePhoneNumber(value));
  const instagram = extractInstagramHandle(source.instagramUrl);
  const entries: LeadChannelAvailability[] = [
    { channel: "sms", label: LEAD_CONTACT_CHANNEL_LABELS.sms, value: mobile ? formatKoreanPhoneNumber(mobile) : undefined, available: Boolean(mobile) },
    { channel: "instagram", label: LEAD_CONTACT_CHANNEL_LABELS.instagram, value: instagram ? `@${instagram}` : undefined, available: Boolean(instagram) },
    { channel: "talktalk", label: LEAD_CONTACT_CHANNEL_LABELS.talktalk, value: source.naverTalktalkUrl || undefined, available: Boolean(source.naverTalktalkUrl) },
    { channel: "email", label: LEAD_CONTACT_CHANNEL_LABELS.email, value: source.email || undefined, available: Boolean(source.email) },
    { channel: "fax", label: LEAD_CONTACT_CHANNEL_LABELS.fax, value: source.fax ? formatKoreanPhoneNumber(source.fax) : undefined, available: Boolean(source.fax) }
  ];
  entries.push({ channel: "visit", label: LEAD_CONTACT_CHANNEL_LABELS.visit, available: true });
  return entries;
}

/** 이 리드에 먼저 쓸 채널 하나(목록의 "1순위 · 문자" 같은 배지와 정렬에 씁니다). */
export function resolvePrimaryLeadContactChannel(source: LeadChannelSource): LeadContactChannel {
  return resolveLeadContactChannels(source).find((entry) => entry.available)?.channel || "visit";
}

/** 정렬용 순위(작을수록 먼저). 문자 1, DM·톡톡 2, 이메일·팩스 3, 방문 4. */
export function leadContactPriorityRank(source: LeadChannelSource): 1 | 2 | 3 | 4 {
  const primary = resolvePrimaryLeadContactChannel(source);
  if (primary === "sms") return 1;
  if (primary === "instagram" || primary === "talktalk") return 2;
  if (primary === "email" || primary === "fax") return 3;
  return 4;
}
