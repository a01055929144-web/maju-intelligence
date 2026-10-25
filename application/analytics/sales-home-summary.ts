import { getLeadVisitAvailability } from "../../domains/lead/business-hours";
import type { PermitLeadItem, SalesContactLedgerItem } from "../../lib/store";

export type SalesHomeSummary = ReturnType<typeof buildSalesHomeSummary>;

const CHANNEL_LABELS: Record<string, string> = {
  call: "전화",
  dm: "DM",
  email: "이메일",
  fax: "팩스",
  sms: "문자",
  talktalk: "톡톡",
  visit: "방문"
};

export function buildSalesHomeSummary(leads: PermitLeadItem[], ledger: SalesContactLedgerItem[], now = new Date()) {
  const monthKey = new Intl.DateTimeFormat("sv-SE", { month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(now);
  const todayKey = new Intl.DateTimeFormat("sv-SE", { day: "2-digit", month: "2-digit", timeZone: "Asia/Seoul", year: "numeric" }).format(now);
  const monthActions = ledger.filter((item) => item.createdAt.slice(0, 7) === monthKey);
  const active = leads.filter((lead) => lead.isActive && lead.status !== "제외" && !lead.matchedCustomerId);
  const contactedLeadIds = new Set(monthActions.map((item) => item.leadId));
  const channelCounts = Object.entries(CHANNEL_LABELS).map(([key, label]) => ({
    key,
    label,
    value: monthActions.filter((item) => item.actionType === key).length
  }));

  return {
    channelCounts,
    funnel: [
      { label: "신규", value: active.filter((lead) => lead.status === "신규 수집").length },
      { label: "연락", value: active.filter((lead) => ["전화 대상", "문자 발송", "DM 발송", "연락 완료"].includes(lead.status)).length },
      { label: "협의", value: active.filter((lead) => ["미팅 예정", "재연락 예정", "견적 요청", "견적 발송"].includes(lead.status)).length },
      { label: "계약", value: active.filter((lead) => ["전환 진행", "거래처 전환"].includes(lead.status)).length }
    ],
    tasks: {
      breakTimeVisit: active.filter((lead) => getLeadVisitAvailability(lead.businessHourIntervals || [], now).hasBreakToday).length,
      closureReview: active.filter((lead) => /폐업 확인 필요/.test(lead.status)).length,
      followUpToday: active.filter((lead) => lead.status === "재연락 예정" && ledger.some((item) => item.leadId === lead.id && Boolean(item.followUpAt && item.followUpAt.slice(0, 10) <= todayKey))).length,
      newToday: active.filter((lead) => lead.leadPeriod === "today").length,
      smsReady: active.filter((lead) => /^010\D*\d{3,4}\D*\d{4}$/.test(lead.phone || "") && !contactedLeadIds.has(lead.id)).length
    },
    totals: {
      active: active.length,
      contactedThisMonth: contactedLeadIds.size
    }
  };
}

