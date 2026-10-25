import type { PermitLeadItem } from "@/lib/store";

export type MobileSalesTaskKind = "dm" | "follow_up" | "sms" | "visit";

export type MobileSalesTaskGroup = {
  count: number;
  items: PermitLeadItem[];
  kind: MobileSalesTaskKind;
};

function isMobilePhone(value?: string) {
  return /^010\D*\d{3,4}\D*\d{4}$/.test(value?.trim() || "");
}

function hasDmChannel(lead: PermitLeadItem) {
  return Boolean(lead.instagramUrl || lead.naverTalktalkUrl);
}

function isContactedStatus(status: string) {
  return ["DM 발송", "문자 발송", "연락 완료", "미팅 예정", "재연락 예정", "전환 진행", "거래처 전환"].includes(status);
}

export function buildMobileSalesTaskGroups(leads: PermitLeadItem[], limit = 12): MobileSalesTaskGroup[] {
  const active = leads.filter((lead) => lead.isActive && lead.status !== "제외" && !lead.matchedCustomerId);
  const followUp = active.filter((lead) => lead.status === "재연락 예정");
  const sms = active.filter((lead) => isMobilePhone(lead.phone) && !isContactedStatus(lead.status));
  const dm = active.filter((lead) => hasDmChannel(lead) && !isContactedStatus(lead.status));
  const used = new Set([...followUp, ...sms, ...dm].map((lead) => lead.id));
  const visit = active
    .filter((lead) => !used.has(lead.id))
    .filter((lead) => Boolean(lead.address))
    .sort((left, right) => right.scoreTotal - left.scoreTotal);

  return [
    { count: followUp.length, items: followUp.slice(0, limit), kind: "follow_up" },
    { count: sms.length, items: sms.slice(0, limit), kind: "sms" },
    { count: dm.length, items: dm.slice(0, limit), kind: "dm" },
    { count: visit.length, items: visit.slice(0, limit), kind: "visit" }
  ];
}

