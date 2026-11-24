/** CX-135 현장 기록(방문 / 비치 / 전단지) 도메인 규칙. 배송완료는 기존 delivery_route_stop_photos를 쓴다. */
export const FIELD_RECORD_KINDS = ["visit", "placement", "flyer"] as const;
export type FieldRecordKind = (typeof FIELD_RECORD_KINDS)[number];
export const FIELD_PLACEMENT_TYPES = ["price_sheet", "quote", "catalog"] as const;
export type FieldPlacementType = (typeof FIELD_PLACEMENT_TYPES)[number];
export const FIELD_RECORD_KIND_LABELS: Record<FieldRecordKind, string> = { visit: "방문", placement: "비치", flyer: "전단지" };
export const FIELD_PLACEMENT_LABELS: Record<FieldPlacementType, string> = { price_sheet: "단가표", quote: "견적서", catalog: "카탈로그" };

export const FIELD_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const FIELD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const FIELD_VIDEO_MAX_SECONDS = 30;
export const FIELD_MEDIA_MAX_COUNT = 10;
export const FIELD_MEMO_MAX = 500;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldRecordInput = {
  accuracyM: number;
  capturedAt: string;
  customerId: string | null;
  idempotencyKey: string;
  kind: FieldRecordKind;
  latitude: number;
  leadId: string | null;
  longitude: number;
  memo: string | null;
  placementTypes: FieldPlacementType[];
};
export type FieldMediaMeta = { durationSeconds?: number; mimeType: string; size: number };
export type ParsedFieldRecord = { ok: true; value: FieldRecordInput } | { message: string; ok: false };

const fail = (message: string): { message: string; ok: false } => ({ message, ok: false });
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (typeof value === "string" || typeof value === "number") && String(value).trim() !== "" ? Number(value) : Number.NaN;

/** 폼 값 → 검증된 입력. 시각은 지금 기준 -24시간~+5분만 받는다(오프라인 재전송 허용·미래 시각 거부). */
export function parseFieldRecord(raw: Record<string, unknown>, now = new Date()): ParsedFieldRecord {
  const kind = text(raw.kind) as FieldRecordKind;
  if (!(FIELD_RECORD_KINDS as readonly string[]).includes(kind)) return fail("기록 종류를 선택해 주세요(방문·비치·전단지).");
  let placementTypes: FieldPlacementType[] = [];
  if (kind === "placement") {
    const list = Array.isArray(raw.placementTypes) ? raw.placementTypes : [];
    placementTypes = FIELD_PLACEMENT_TYPES.filter((type) => list.includes(type));
    if (!placementTypes.length || placementTypes.length !== new Set(list).size) return fail("비치한 자료(단가표·견적서·카탈로그)를 1개 이상 선택해 주세요.");
  } else if (Array.isArray(raw.placementTypes) && raw.placementTypes.length) return fail("비치 자료는 비치 기록에만 선택할 수 있습니다.");
  const customerId = text(raw.customerId) || null;
  const leadId = text(raw.leadId) || null;
  if ((customerId && !UUID.test(customerId)) || (leadId && !UUID.test(leadId))) return fail("대상 매장을 확인해 주세요.");
  const latitude = num(raw.latitude), longitude = num(raw.longitude), accuracyM = num(raw.accuracyM);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    return fail("위치(위도·경도)를 확인해 주세요. 위치 권한을 허용해야 기록할 수 있습니다.");
  if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 100000) return fail("위치 정확도를 확인해 주세요.");
  const captured = Date.parse(text(raw.capturedAt));
  if (!Number.isFinite(captured) || captured > now.getTime() + 5 * 60_000 || captured < now.getTime() - 24 * 3_600_000)
    return fail("촬영 시각을 확인해 주세요(24시간 이내).");
  const memo = text(raw.memo);
  if (memo.length > FIELD_MEMO_MAX) return fail(`메모는 ${FIELD_MEMO_MAX}자 이하로 입력해 주세요.`);
  const idempotencyKey = text(raw.idempotencyKey);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/.test(idempotencyKey)) return fail("기록 식별값을 확인해 주세요.");
  return { ok: true, value: { accuracyM: Math.round(accuracyM * 10) / 10, capturedAt: new Date(captured).toISOString(), customerId, idempotencyKey, kind,
    latitude: Math.round(latitude * 1e6) / 1e6, leadId, longitude: Math.round(longitude * 1e6) / 1e6, memo: memo || null, placementTypes } };
}

/** 사진·영상 목록 검증. 사진 8MB·영상 50MB·30초 이하(영상은 길이 필수), 영상은 1개까지, 전체 10개까지. */
export function validateFieldMedia(files: readonly FieldMediaMeta[]): { message?: string; ok: boolean; photoCount: number } {
  let photos = 0, videos = 0;
  if (files.length > FIELD_MEDIA_MAX_COUNT) return { message: `사진·영상은 ${FIELD_MEDIA_MAX_COUNT}개까지 올릴 수 있습니다.`, ok: false, photoCount: 0 };
  for (const file of files) {
    if (PHOTO_TYPES.includes(file.mimeType)) {
      if (file.size <= 0 || file.size > FIELD_PHOTO_MAX_BYTES) return { message: "사진은 8MB 이하만 올릴 수 있습니다.", ok: false, photoCount: 0 };
      photos += 1;
    } else if (VIDEO_TYPES.includes(file.mimeType)) {
      if (file.size <= 0 || file.size > FIELD_VIDEO_MAX_BYTES) return { message: "영상은 50MB 이하만 올릴 수 있습니다.", ok: false, photoCount: 0 };
      if (!Number.isFinite(file.durationSeconds) || !file.durationSeconds || file.durationSeconds <= 0 || file.durationSeconds > FIELD_VIDEO_MAX_SECONDS)
        return { message: "영상은 30초 이하만 올릴 수 있습니다.", ok: false, photoCount: 0 };
      videos += 1;
    } else return { message: "JPG·PNG·WEBP·HEIC 사진 또는 MP4·MOV·WEBM 영상만 올릴 수 있습니다.", ok: false, photoCount: 0 };
  }
  if (videos > 1) return { message: "영상은 1개까지 올릴 수 있습니다.", ok: false, photoCount: 0 };
  return { ok: true, photoCount: photos };
}

/** 사진이 1장 이상일 때만 방문으로 인정한다(비치 포함). 영상만 있으면 인정 안 됨. */
export const countsAsVisit = (photoCount: number) => photoCount >= 1;

export function fieldMediaExtension(mimeType: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" } as Record<string, string>)[mimeType] ?? "bin";
}
