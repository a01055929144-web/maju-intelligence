import { toLeadStageValue } from "../domains/lead/lead-status";

export type MapLeadReminderInput = {
  followUpAt?: string;
  lastContactAt?: string;
  status: string;
};

export function getMapLeadReminderLabel(lead: MapLeadReminderInput, now = new Date()) {
  const nowMs = now.getTime();
  const followUpMs = lead.followUpAt ? new Date(lead.followUpAt).getTime() : Number.NaN;
  if (Number.isFinite(followUpMs) && followUpMs < nowMs) return "재연락 예정일이 지났습니다";

  const lastContactMs = lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : Number.NaN;
  if (!Number.isFinite(lastContactMs)) return "";
  const days = Math.floor((nowMs - lastContactMs) / 86400000);
  if (days < 5) return "";
  const stage = toLeadStageValue(lead.status);
  if (stage === "견적 발송") return `견적 전달 후 ${days}일 · 답변 확인`;
  if (stage === "연락 완료") return `연락 후 ${days}일 · 결과 확인`;
  return "";
}

export async function runMapLeadStageBulk(
  leadIds: readonly string[],
  update: (leadId: string) => Promise<{ ok: boolean; message?: string }>,
  concurrency = 4
) {
  const results = new Map<string, { ok: boolean; message?: string }>();
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), leadIds.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < leadIds.length) {
      const leadId = leadIds[cursor];
      cursor += 1;
      results.set(leadId, await update(leadId));
    }
  }));
  return leadIds.map((leadId) => ({ leadId, ...(results.get(leadId) || { ok: false, message: "처리 결과가 없습니다." }) }));
}
