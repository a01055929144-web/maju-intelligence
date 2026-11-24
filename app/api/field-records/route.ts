import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getCustomerOperationalName, getRequestAuthScope, scopeHasCapability, shouldScopeCustomerData } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { canAccessAssignedCustomer, createCustomerAttachmentSignedUrl, CUSTOMER_ATTACHMENT_BUCKET, supabaseRequest, supabaseStorageRequest } from "@/lib/store";
import { fieldMediaExtension, parseFieldRecord, validateFieldMedia, FIELD_MEDIA_MAX_COUNT } from "@/domains/field-record/field-record";

export const dynamic = "force-dynamic";
const q = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

type RecordRow = {
  id: string; kind: string; placement_types: string[]; actor_user_id: string; customer_id: string | null; lead_id: string | null;
  latitude: number; longitude: number; accuracy_m: number; captured_at: string; memo: string | null; photo_count: number; counts_as_visit: boolean;
  field_record_photos?: Array<{ id: string; media_kind: string; storage_path: string; mime_type: string; sort_order: number }>;
};

/** 기능 플래그(기본 OFF + 회사 allowlist) 뒤. 쓰기는 서버(service role)만, 기록자는 로그인한 활성 구성원. */
async function guard(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId || !scope.customerSession?.userId) return { error: reply(401, "로그인이 필요합니다.") };
  if (!isFeatureEnabled("FIELD_RECORDS", scope.companyId)) return { error: reply(404, "현장 기록 기능이 아직 열리지 않았습니다.") };
  return { companyId: scope.companyId, scope, session: scope.customerSession };
}

export async function POST(request: NextRequest) {
  const auth = await guard(request);
  if ("error" in auth) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return reply(400, "기록 값을 확인해 주세요.");
  const parsed = parseFieldRecord({
    accuracyM: form.get("accuracyM"), capturedAt: form.get("capturedAt"), customerId: form.get("customerId"), idempotencyKey: form.get("idempotencyKey"),
    kind: form.get("kind"), latitude: form.get("latitude"), leadId: form.get("leadId"), longitude: form.get("longitude"), memo: form.get("memo"),
    placementTypes: form.getAll("placementTypes").map(String)
  });
  if (!parsed.ok) return reply(400, parsed.message);
  const input = parsed.value;
  const files = form.getAll("media").filter((item): item is File => item instanceof File);
  const duration = Number(form.get("videoDurationSeconds"));
  const media = validateFieldMedia(files.map((file) => ({ durationSeconds: file.type.startsWith("video/") ? duration : undefined, mimeType: file.type, size: file.size })));
  if (!media.ok) return reply(400, media.message ?? "사진·영상을 확인해 주세요.");
  if (input.customerId && shouldScopeCustomerData(auth.session) &&
    !await canAccessAssignedCustomer(auth.companyId, input.customerId, getCustomerAssignmentKeys(auth.session)))
    return reply(403, "배정된 매장에만 기록할 수 있습니다.");
  try {
    // 같은 기록 식별값으로 다시 보내도 같은 경로에 덮어쓴다(재전송 안전). 경로에는 식별값 해시만 쓴다.
    const folder = `${auth.companyId}/field-records/${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32)}`;
    const uploaded = [] as Array<{ duration_seconds?: number; kind: string; mime_type: string; size_bytes: number; storage_path: string }>;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const storagePath = `${folder}/${index}.${fieldMediaExtension(file.type)}`;
      await supabaseStorageRequest(`object/${CUSTOMER_ATTACHMENT_BUCKET}/${storagePath}`, {
        method: "POST", headers: { "Content-Type": file.type, "x-upsert": "true" }, body: await file.arrayBuffer()
      });
      const isVideo = file.type.startsWith("video/");
      uploaded.push({ kind: isVideo ? "video" : "photo", mime_type: file.type, size_bytes: file.size, storage_path: storagePath, ...(isVideo ? { duration_seconds: duration } : {}) });
    }
    const result = await supabaseRequest<{ countsAsVisit: boolean; id: string; leadActionId?: string; reused: boolean }>("rpc/create_field_record_v1", {
      method: "POST", body: JSON.stringify({
        p_company_id: auth.companyId, p_actor_user_id: auth.session.userId, p_actor_member_id: auth.session.companyMemberId ?? null, p_kind: input.kind,
        p_placement_types: input.placementTypes, p_customer_id: input.customerId, p_lead_id: input.leadId, p_assignment_id: null,
        p_latitude: input.latitude, p_longitude: input.longitude, p_accuracy_m: input.accuracyM, p_captured_at: input.capturedAt, p_memo: input.memo,
        p_idempotency_key: input.idempotencyKey, p_media: uploaded, p_actor_name: getCustomerOperationalName(auth.session)
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
  const auth = await guard(request);
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
