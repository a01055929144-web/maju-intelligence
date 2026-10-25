import { extractInstagramHandle, isMobilePhoneNumber } from "./contact-channels";
import { toLeadStageValue } from "./lead-status";

export type LeadNextActionSource = {
  email?: string | null;
  fax?: string | null;
  instagramUrl?: string | null;
  naverTalktalkUrl?: string | null;
  nextAction?: string | null;
  phone?: string | null;
  status?: string | null;
};

export type LeadNextActionRecommendation = {
  action: "call" | "dm" | "email" | "fax" | "sms" | "visit";
  label: string;
};

const LEGACY_NEXT_ACTION_LABELS: Record<string, string> = {
  "DM 대상": "오늘 DM",
  "DM 발송": "DM 후속 확인",
  "방문 대상": "방문 검토",
  "전화 대상": "오늘 바로 전화"
};

/** 신규 리드의 확보 채널을 기준으로 오늘 실행할 한 가지 행동을 추천합니다. */
export function recommendLeadNextAction(source: LeadNextActionSource): LeadNextActionRecommendation {
  if (isMobilePhoneNumber(source.phone)) return { action: "sms", label: "오늘 문자" };
  if (source.phone?.trim()) return { action: "call", label: "오늘 바로 전화" };
  if (extractInstagramHandle(source.instagramUrl) || source.naverTalktalkUrl?.trim()) return { action: "dm", label: "오늘 DM" };
  if (source.email?.trim()) return { action: "email", label: "오늘 이메일" };
  if (source.fax?.trim()) return { action: "fax", label: "오늘 팩스" };
  return { action: "visit", label: "방문 검토" };
}

/** 기존 저장값은 지우지 않고 화면에서만 새 실행 용어로 맞춥니다. */
export function displayLeadNextAction(source: LeadNextActionSource): string {
  const saved = String(source.nextAction || "").trim();
  if (saved) return LEGACY_NEXT_ACTION_LABELS[saved] || saved;
  return recommendLeadNextAction(source).label;
}

/** last_contact_at 도입 전 호환용. 공통 단계가 신규가 아니면 연락 이력이 있다고 봅니다. */
export function isLeadUncontacted(source: Pick<LeadNextActionSource, "status">): boolean {
  return toLeadStageValue(source.status) === "신규 수집";
}
