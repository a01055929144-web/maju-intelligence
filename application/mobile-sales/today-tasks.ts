import type { PermitLeadItem } from "@/lib/store";
import { isMobilePhoneNumber } from "../../domains/lead/contact-channels";
import { toLeadStageValue } from "../../domains/lead/lead-status";

export type MobileSalesTaskKind = "dm" | "follow_up" | "sms" | "visit";

export type MobileSalesTaskGroup = {
  count: number;
  items: PermitLeadItem[];
  kind: MobileSalesTaskKind;
};

function hasDmChannel(lead: PermitLeadItem) {
  return Boolean(lead.instagramUrl || lead.naverTalktalkUrl);
}

function isContactedStatus(status: string) {
  return ["DM 발송", "문자 발송", "연락 완료", "미팅 예정", "재연락 예정", "전환 진행", "거래처 전환"].includes(status);
}

export function buildMobileSalesTaskGroups(leads: PermitLeadItem[], limit = 12): MobileSalesTaskGroup[] {
  const active = leads.filter((lead) =>
    lead.isActive && !lead.isTemporaryOperation && !lead.isTemporaryOperationSuspected && !lead.matchedCustomerId &&
    (toLeadStageValue(lead.status) === "신규 수집" || lead.status === "재연락 예정")
  );
  const followUp = active
    .filter((lead) => lead.status === "재연락 예정")
    .sort((left, right) => String(left.followUpAt || "9999-12-31").localeCompare(String(right.followUpAt || "9999-12-31")));
  const followUpIds = new Set(followUp.map((lead) => lead.id));
  const sms = active.filter((lead) => !followUpIds.has(lead.id) && isMobilePhoneNumber(lead.phone) && !isContactedStatus(lead.status));
  const smsIds = new Set(sms.map((lead) => lead.id));
  const dm = active.filter((lead) => !followUpIds.has(lead.id) && !smsIds.has(lead.id) && hasDmChannel(lead) && !isContactedStatus(lead.status));
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

