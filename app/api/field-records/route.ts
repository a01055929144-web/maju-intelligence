import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getCustomerOperationalName, scopeHasCapability, shouldScopeCustomerData } from "@/lib/auth";
import { fieldRecordGuard, fieldRecordReply as reply, readSmallJson } from "@/lib/field-records/guard";
import { claimKind, verifyUploadedMedia } from "@/lib/field-records/storage";
import { canAccessAssignedCustomer, createCustomerAttachmentSignedUrl, supabaseRequest } from "@/lib/store";
import { FIELD_MEDIA_MAX_COUNT, parseFieldRecord } from "@/domains/field-record/field-record";

export const dynamic = "force-dynamic";
const q = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecordRow = {
  id: string; kind: string; placement_types: string[]; actor_user_id: string; customer_id: string | null; lead_id: string | null;
  latitude: number; longitude: number; accuracy_m: number; captured_at: string; memo: string | null; photo_count: number; counts_as_visit: boolean;
  field_record_photos?: Array<{ id: string; media_kind: string; storage_path: string; mime_type: string; sort_order: number }>;
};

/**
 * 2단계: 파일은 이미 저장소에 올라가 있다(upload-urls 주소로 브라우저가 직접 업로드). 이 요청은 작은 JSON만 받는다.
 * 서버는 올라간 객체의 존재·경로·크기·종류를 저장소에서 확인한 뒤 create_field_record_v1을 부른다(경로의 회사 폴더 검사는 DB 함수가 한 번 더).
 */
export async function POST(request: NextRequest) {
  const auth = await fieldRecordGuard(request);
  if ("error" in auth) return auth.error;
  const body = await readSmallJson(request, 32 * 1024) as (Record<string, unknown> & { media?: unknown }) | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, "기록 값을 확인해 주세요.");
  const parsed = parseFieldRecord(body);
  if (!parsed.ok) return reply(400, parsed.message);
  const input = parsed.value;
  const list = Array.isArray(body.media) ? body.media : [];
  if (list.length > FIELD_MEDIA_MAX_COUNT) return reply(400, `사진·영상은 ${FIELD_MEDIA_MAX_COUNT}개까지 올릴 수 있습니다.`);
  const media = list.map((item) => {
    const entry = (item ?? {}) as { durationSeconds?: unknown; mimeType?: unknown; path?: unknown; size?: unknown };
    const mimeType = typeof entry.mimeType === "string" ? entry.mimeType : "";
    return { durationSeconds: typeof entry.durationSeconds === "number" ? entry.durationSeconds : undefined, kind: claimKind(mimeType), mimeType,
      path: typeof entry.path === "string" ? entry.path : "", size: typeof entry.size === "number" ? entry.size : Number.NaN };
  });
  if (input.customerId && shouldScopeCustomerData(auth.session) &&
    !await canAccessAssignedCustomer(auth.companyId, input.customerId, getCustomerAssignmentKeys(auth.session)))
    return reply(403, "배정된 매장에만 기록할 수 있습니다.");
  try {
    const verified = await verifyUploadedMedia(auth.companyId, input.idempotencyKey, media);
    if (!verified.ok) return reply(400, verified.message ?? "사진·영상을 확인해 주세요.");
    const result = await supabaseRequest<{ countsAsVisit: boolean; id: string; leadActionId?: string; reused: boolean }>("rpc/create_field_record_v1", {
      method: "POST", body: JSON.stringify({
        p_company_id: auth.companyId, p_actor_user_id: auth.session.userId, p_actor_member_id: auth.session.companyMemberId ?? null, p_kind: input.kind,
        p_placement_types: input.placementTypes, p_customer_id: input.customerId, p_lead_id: input.leadId, p_assignment_id: null,
        p_latitude: input.latitude, p_longitude: input.longitude, p_accuracy_m: input.accuracyM, p_captured_at: input.capturedAt, p_memo: input.memo,
        p_idempotency_key: input.idempotencyKey, p_actor_name: getCustomerOperationalName(auth.session),
        p_media: media.map((item) => ({ kind: item.kind, mime_type: item.mimeType, size_bytes: item.size, storage_path: item.path, ...(item.kind === "video" ? { duration_seconds: item.durationSeconds } : {}) }))
      })
    });
    return NextResponse.json({ countsAsVisit: result.countsAsVisit, id: result.id, reused: result.reused }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("field_record_actor_forbidden")) return reply(403, "이 회사의 활성 구성원만 기록할 수 있습니다.");
    if (message.includes("field_record_media_invalid")) return reply(400, "사진·영상을 확인해 주세요.");
    if (message.includes("violates foreign key")) return reply(400, "대상 매장을 확인해 주세요.");
    return reply(503, "현장 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 내 기록, 또는 회사 운영 권한이 있으면 전체(대상 매장·리드 필터). 사진·영상은 10분짜리 서명 주소로만 보인다. */
export async function GET(request: NextRequest) {
  const auth = await fieldRecordGuard(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const customerId = params.get("customerId") || "", leadId = params.get("leadId") || "";
  if ((customerId && !UUID.test(customerId)) || (leadId && !UUID.test(leadId))) return reply(400, "대상 매장을 확인해 주세요.");
  const manager = scopeHasCapability(auth.scope, "view_company_operations");
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
  const filters = [`company_id=eq.${q(auth.companyId)}`, ...(manager ? [] : [`actor_user_id=eq.${q(auth.session.userId!)}`]),
    ...(customerId ? [`customer_id=eq.${q(customerId)}`] : []), ...(leadId ? [`lead_id=eq.${q(leadId)}`] : [])];
  try {
    const rows = await supabaseRequest<RecordRow[]>(
      `field_records?select=id,kind,placement_types,actor_user_id,customer_id,lead_id,latitude,longitude,accuracy_m,captured_at,memo,photo_count,counts_as_visit,field_record_photos(id,media_kind,storage_path,mime_type,sort_order)&${filters.join("&")}&order=captured_at.desc&limit=${limit}`
    );
    const records = await Promise.all(rows.map(async (row) => ({
      accuracyM: Number(row.accuracy_m), capturedAt: row.captured_at, countsAsVisit: row.counts_as_visit, customerId: row.customer_id, id: row.id, kind: row.kind,
      latitude: Number(row.latitude), leadId: row.lead_id, longitude: Number(row.longitude), memo: row.memo, placementTypes: row.placement_types, photoCount: row.photo_count,
      media: await Promise.all((row.field_record_photos ?? []).sort((a, b) => a.sort_order - b.sort_order).slice(0, FIELD_MEDIA_MAX_COUNT).map(async (item) => ({
        id: item.id, kind: item.media_kind, mimeType: item.mime_type, url: await createCustomerAttachmentSignedUrl(item.storage_path, 600).catch(() => "")
      })))
    })));
    return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return reply(503, "현장 기록을 불러오지 못했습니다.");
  }
}
