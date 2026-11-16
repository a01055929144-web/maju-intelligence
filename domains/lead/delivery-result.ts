// CC-65: 기사가 단가표를 전달했나 · 받은 쪽이 열어봤나를 지도 리드 목록용 짧은 글로. React·DB를 모른다.
export type LeadDeliveryResult = { readonly leadId: string; readonly deliveredAt?: string | null; readonly openedAt?: string | null };

const DAY_MS = 86_400_000;
function daysAgo(iso: string, nowMs: number): string {
  const diff = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
  return diff <= 0 ? "오늘" : `${diff}일 전`;
}

/** 예: ["단가표 전달 3일 전", "열어봄"]. 시각이 없거나 잘못된 값이면 그 항목은 뺀다. */
export function deliveryResultParts(result: Pick<LeadDeliveryResult, "deliveredAt" | "openedAt"> | undefined, nowMs: number): string[] {
  if (!result) return [];
  const ok = (iso?: string | null): iso is string => Boolean(iso) && Number.isFinite(Date.parse(iso as string));
  return [ok(result.deliveredAt) ? `단가표 전달 ${daysAgo(result.deliveredAt, nowMs)}` : "", ok(result.openedAt) ? "열어봄" : ""].filter(Boolean);
}

/** 같은 리드의 여러 기록은 가장 최근 시각만 남겨 합친다. */
export function mergeDeliveryResults(deliveries: ReadonlyArray<{ leadId: string; at: string }>, opens: ReadonlyArray<{ leadId: string; at: string }>): LeadDeliveryResult[] {
  const byLead = new Map<string, { deliveredAt?: string; openedAt?: string }>();
  const newest = (a: string | undefined, b: string) => (a && Date.parse(a) >= Date.parse(b) ? a : b);
  for (const row of deliveries) byLead.set(row.leadId, { ...byLead.get(row.leadId), deliveredAt: newest(byLead.get(row.leadId)?.deliveredAt, row.at) });
  for (const row of opens) byLead.set(row.leadId, { ...byLead.get(row.leadId), openedAt: newest(byLead.get(row.leadId)?.openedAt, row.at) });
  return Array.from(byLead, ([leadId, value]) => ({ leadId, ...value }));
}
