import { FIELD_PHOTO_MAX_BYTES, type FieldPlacementType, type FieldRecordKind } from "../../domains/field-record/field-record";

/** 브라우저 쪽 현장 기록 업로드. 파일은 Next 함수를 거치지 않고 저장소 서명 주소로 직접 올라간다(함수 본문 한도 약 4.5MB 회피). */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;

/** 긴 변이 최대치를 넘을 때만 비율을 유지해 줄인다(키우지 않는다). */
export function resizedSize(width: number, height: number, maxEdge = PHOTO_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!(longest > maxEdge)) return { height, width };
  const scale = maxEdge / longest;
  return { height: Math.max(1, Math.round(height * scale)), width: Math.max(1, Math.round(width * scale)) };
}

/**
 * 사진을 올리기 전에 줄인다: 긴 변 1600px, JPEG 품질 0.8(회전 정보 반영). 이미 작은 JPEG는 그대로 둔다.
 * 읽지 못하면(예: 이 브라우저가 못 여는 HEIC) 올릴 수 있는 형식·크기일 때만 원본을 쓰고, 아니면 안내 문구와 함께 실패한다.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { height, width } = resizedSize(bitmap.width, bitmap.height);
    if (file.type === "image/jpeg" && width === bitmap.width && height === bitmap.height && file.size <= FIELD_PHOTO_MAX_BYTES) { bitmap.close(); return file; }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY));
    if (!blob) throw new Error("encode");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { lastModified: file.lastModified, type: "image/jpeg" });
  } catch {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= FIELD_PHOTO_MAX_BYTES) return file;
    throw new Error("이 사진을 줄이지 못했습니다. 카메라 설정에서 JPEG(호환성 우선)로 찍거나 다른 사진을 선택해 주세요.");
  }
}

export type FieldRecordSubmission = {
  accuracyM: number; capturedAt: string; customerId?: string | null; idempotencyKey: string; kind: FieldRecordKind; latitude: number; leadId?: string | null;
  longitude: number; memo?: string; photos: readonly File[]; placementTypes: readonly FieldPlacementType[]; video?: { durationSeconds: number; file: File } | null;
};

async function failure(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return new Error(body.message || fallback);
}

/** 1) 서명 주소 받기 → 2) 저장소로 직접 업로드 → 3) 경로만 담은 작은 JSON으로 기록. 같은 식별값으로 다시 부르면 같은 경로에 덮어쓰고 같은 기록으로 처리된다. */
export async function submitFieldRecord(input: FieldRecordSubmission, fetchImpl: typeof fetch = fetch): Promise<{ countsAsVisit: boolean; id: string; reused: boolean }> {
  const files = [...input.photos, ...(input.video ? [input.video.file] : [])];
  const meta = files.map((file, index) => ({ mimeType: file.type, size: file.size, ...(input.video && index === files.length - 1 ? { durationSeconds: input.video.durationSeconds } : {}) }));
  let uploads: Array<{ path: string; uploadUrl: string }> = [];
  if (files.length) {
    const signed = await fetchImpl("/api/field-records/upload-urls", { body: JSON.stringify({ files: meta, idempotencyKey: input.idempotencyKey }), headers: { "Content-Type": "application/json" }, method: "POST" });
    if (!signed.ok) throw await failure(signed, "업로드 주소를 받지 못했습니다. 다시 시도해 주세요.");
    uploads = (await signed.json() as { uploads: typeof uploads }).uploads;
    if (uploads.length !== files.length) throw new Error("업로드 주소를 확인하지 못했습니다. 다시 시도해 주세요.");
  }
  for (let index = 0; index < files.length; index += 1) {
    const put = await fetchImpl(uploads[index].uploadUrl, { body: files[index], headers: { "Content-Type": files[index].type, "x-upsert": "true" }, method: "PUT" });
    if (!put.ok) throw new Error(`${index + 1}번째 파일을 올리지 못했습니다. 같은 화면에서 다시 눌러 주세요.`);
  }
  const response = await fetchImpl("/api/field-records", { body: JSON.stringify({
    accuracyM: input.accuracyM, capturedAt: input.capturedAt, customerId: input.customerId || undefined, idempotencyKey: input.idempotencyKey, kind: input.kind,
    latitude: input.latitude, leadId: input.leadId || undefined, longitude: input.longitude, memo: input.memo?.trim() || undefined,
    media: meta.map((item, index) => ({ ...item, path: uploads[index].path })),
    placementTypes: input.kind === "placement" ? input.placementTypes : []
  }), headers: { "Content-Type": "application/json" }, method: "POST" });
  if (!response.ok) throw await failure(response, "현장 기록을 저장하지 못했습니다. 같은 화면에서 다시 눌러 주세요.");
  return await response.json() as { countsAsVisit: boolean; id: string; reused: boolean };
}
