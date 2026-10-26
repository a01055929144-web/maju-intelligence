import { supabaseRequest } from "../store";

export type InsightsDeliveryRecord = {
  completedAt: string;
  shared: boolean;
};

/** 배송 완료와 고객 공유 여부를 같은 배송 메모 기준으로 묶습니다. */
export async function listInsightsDeliveryRecords(
  companyId: string,
  range: { from: string; to: string }
): Promise<InsightsDeliveryRecord[]> {
  const company = encodeURIComponent(companyId);
  const from = encodeURIComponent(range.from);
  const to = encodeURIComponent(range.to);
  const notes = await supabaseRequest<Array<{ created_at: string; id: string; memo: string | null }>>(
    `customer_notes?select=id,created_at,memo&company_id=eq.${company}&note_type=eq.delivery&created_at=gte.${from}&created_at=lt.${to}&order=created_at.asc&limit=5000`
  ).catch(() => []);
  if (!notes.length) return [];

  const noteIds = notes.map((note) => encodeURIComponent(note.id)).join(",");
  const logs = await supabaseRequest<Array<{ note_id: string | null; status: string }>>(
    `customer_message_logs?select=note_id,status&company_id=eq.${company}&note_id=in.(${noteIds})&trigger_type=in.(delivery_complete,delivery_issue)&limit=5000`
  ).catch(() => []);
  const sharedNoteIds = new Set(logs.filter((log) => log.note_id && log.status !== "failed").map((log) => log.note_id as string));

  return notes.map((note) => ({
    completedAt: note.created_at,
    shared: sharedNoteIds.has(note.id) || /알림 방식:\s*카카오 공유/.test(note.memo || "")
  }));
}
