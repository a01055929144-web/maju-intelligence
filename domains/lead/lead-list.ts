import { leadContactPriorityRank, resolvePrimaryLeadContactChannel, type LeadChannelSource } from "./contact-channels";

export const LEAD_PRIORITY_LABELS = {
  1: "1순위 · 문자",
  2: "2순위 · DM·톡톡",
  3: "3순위 · 메일·팩스",
  4: "4순위 · 방문"
} as const;

export type LeadListSortSource = LeadChannelSource & {
  businessName: string;
  openDate?: string | null;
  permitDate?: string | null;
};

export function leadPriorityBadge(source: LeadChannelSource) {
  const rank = leadContactPriorityRank(source);
  return { channel: resolvePrimaryLeadContactChannel(source), label: LEAD_PRIORITY_LABELS[rank], rank };
}

function openDateValue(source: LeadListSortSource): string {
  return String(source.openDate || source.permitDate || "");
}

/** 기본 목록은 연락 성공 가능성이 높은 채널을 우선하고, 같은 순위에서는 최근 개업 매장을 먼저 둡니다. */
export function compareLeadListDefault(a: LeadListSortSource, b: LeadListSortSource): number {
  const priority = leadContactPriorityRank(a) - leadContactPriorityRank(b);
  if (priority) return priority;
  const date = openDateValue(b).localeCompare(openDateValue(a));
  if (date) return date;
  return a.businessName.localeCompare(b.businessName, "ko");
}

export function formatLeadOpenDateAge(value: string | null | undefined, now = new Date()): string | null {
  if (!value) return null;
  const opened = new Date(`${value.slice(0, 10)}T00:00:00+09:00`);
  if (Number.isNaN(opened.getTime())) return null;
  const kstToday = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now) + "T00:00:00+09:00");
  const days = Math.max(0, Math.floor((kstToday.getTime() - opened.getTime()) / 86_400_000));
  return `${days.toLocaleString("ko-KR")}일 전`;
}
