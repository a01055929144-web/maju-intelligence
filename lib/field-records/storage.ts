import { createHash } from "crypto";
import { fieldMediaExtension, validateFieldMedia, type FieldMediaMeta } from "../../domains/field-record/field-record";
import { CUSTOMER_ATTACHMENT_BUCKET, supabaseStorageRequest } from "../store";
import { getSupabaseConfig } from "../store/00-core";

/** 사진·영상은 Vercel 함수 본문(약 4.5MB 한도)을 거치지 않고 브라우저가 저장소로 직접 올린다. 서버는 서명 주소 발급과 올라간 객체 확인만 한다. */
export type FieldMediaClaim = FieldMediaMeta & { kind: "photo" | "video" };
export type UploadTarget = { index: number; kind: "photo" | "video"; mimeType: string; path: string; uploadUrl: string };

/** 같은 기록 식별값은 같은 폴더·같은 경로로 이어진다(재전송 안전). 경로에는 식별값의 해시만 쓴다. */
export function fieldMediaFolder(companyId: string, idempotencyKey: string) {
  return `${companyId}/field-records/${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}
export const fieldMediaPath = (companyId: string, idempotencyKey: string, index: number, mimeType: string) =>
  `${fieldMediaFolder(companyId, idempotencyKey)}/${index}.${fieldMediaExtension(mimeType)}`;
export const claimKind = (mimeType: string): "photo" | "video" => (mimeType.startsWith("video/") ? "video" : "photo");

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** 파일 정보(개수·종류·크기·영상 길이)를 검증하고 경로별 서명 업로드 주소를 만든다. 파일 내용은 받지 않는다. */
export async function createUploadTargets(companyId: string, idempotencyKey: string, files: readonly FieldMediaMeta[]): Promise<{ message?: string; ok: boolean; uploads: UploadTarget[] }> {
  const check = validateFieldMedia(files);
  if (!check.ok) return { message: check.message, ok: false, uploads: [] };
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const uploads: UploadTarget[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const path = fieldMediaPath(companyId, idempotencyKey, index, files[index].mimeType);
    // 서명 업로드 주소의 유효시간은 저장소가 정한다(Supabase는 2시간 고정, 경로 하나에만 쓸 수 있음).
    const signed = await supabaseStorageRequest<{ url: string }>(`object/upload/sign/${CUSTOMER_ATTACHMENT_BUCKET}/${encodePath(path)}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-upsert": "true" }, body: "{}"
    });
    uploads.push({ index, kind: claimKind(files[index].mimeType), mimeType: files[index].mimeType, path,
      uploadUrl: signed.url.startsWith("http") ? signed.url : `${config.url}/storage/v1${signed.url}` });
  }
  return { ok: true, uploads };
}

type StorageListItem = { metadata?: { mimetype?: string; size?: number | string } | null; name: string };

/**
 * 기록하려는 미디어가 실제로 저장소에 있고, 경로·크기·종류가 주장과 같은지 확인한다.
 * 경로는 이 회사·이 기록 식별값에서 서버가 다시 계산한 값과 정확히 같아야 한다(다른 회사·다른 폴더·임의 경로 거부).
 */
export async function verifyUploadedMedia(companyId: string, idempotencyKey: string, media: ReadonlyArray<FieldMediaClaim & { path: string }>): Promise<{ message?: string; ok: boolean }> {
  const check = validateFieldMedia(media);
  if (!check.ok) return { message: check.message, ok: false };
  for (let index = 0; index < media.length; index += 1) {
    if (media[index].path !== fieldMediaPath(companyId, idempotencyKey, index, media[index].mimeType) || media[index].kind !== claimKind(media[index].mimeType))
      return { message: "올린 사진·영상 경로를 확인해 주세요.", ok: false };
  }
  if (!media.length) return { ok: true };
  const folder = fieldMediaFolder(companyId, idempotencyKey);
  const items = await supabaseStorageRequest<StorageListItem[]>(`object/list/${CUSTOMER_ATTACHMENT_BUCKET}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefix: folder, limit: 100 })
  });
  const byName = new Map((Array.isArray(items) ? items : []).map((item) => [item.name, item]));
  for (const item of media) {
    const found = byName.get(item.path.slice(folder.length + 1));
    const size = Number(found?.metadata?.size), mimetype = found?.metadata?.mimetype;
    // 객체가 없거나 크기·종류를 확인할 수 없으면 기록하지 않는다(확인 못 하면 거부).
    if (!found || !Number.isFinite(size) || !mimetype) return { message: "사진·영상이 아직 올라가지 않았습니다. 다시 시도해 주세요.", ok: false };
    if (size !== item.size || mimetype.split(";")[0] !== item.mimeType) return { message: "올린 파일이 선택한 파일과 다릅니다. 다시 시도해 주세요.", ok: false };
  }
  return { ok: true };
}
