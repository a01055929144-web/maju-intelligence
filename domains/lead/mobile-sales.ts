import type { PermitLeadItem } from "@/lib/store";

const NEW_LEAD_MAX_AGE_DAYS = 90;

export type MobileLeadType = "new" | "sales";
export type MobileLeadSort = "near" | "sales";

export function getMobileLeadType(lead: Pick<PermitLeadItem, "openDate" | "permitDate">): MobileLeadType {
  const dateText = lead.openDate || lead.permitDate;
  if (!dateText) return "sales";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "sales";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEW_LEAD_MAX_AGE_DAYS);
  return date >= cutoff ? "new" : "sales";
}

export function distanceKm(
  from: { latitude: number; longitude: number } | null,
  lead: Pick<PermitLeadItem, "latitude" | "longitude">
): number | null {
  if (!from || typeof lead.latitude !== "number" || typeof lead.longitude !== "number") return null;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(lead.latitude - from.latitude);
  const longitudeDelta = toRadians(lead.longitude - from.longitude);
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(lead.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildContactMemo(input: {
  collateral: readonly string[];
  memo: string;
  reminderDate?: string;
}): string {
  const lines = [input.memo.trim()];
  if (input.collateral.length) lines.push(`[전달자료: ${input.collateral.join(", ")}]`);
  if (input.reminderDate) lines.push(`[리마인드: ${input.reminderDate}]`);
  return lines.filter(Boolean).join("\n");
}

export function extractReminderDate(memo?: string): string | null {
  return memo?.match(/\[리마인드:\s*(\d{4}-\d{2}-\d{2})\]/)?.[1] || null;
}

export function isContactedLead(status: string): boolean {
  return ["연락 완료", "미팅 예정", "견적 요청", "견적 발송", "재연락 예정", "방문 대상", "제외"].includes(status);
}
