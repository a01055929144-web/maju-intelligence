import { NextRequest, NextResponse } from "next/server";
import { fieldRecordGuard, fieldRecordReply, readSmallJson } from "@/lib/field-records/guard";
import { createUploadTargets } from "@/lib/field-records/storage";

export const dynamic = "force-dynamic";

/** 1단계: 파일 개수·종류·크기(·영상 길이)만 받아 검증하고 경로별 서명 업로드 주소를 준다. 파일 내용은 이 함수를 거치지 않는다. */
export async function POST(request: NextRequest) {
  const auth = await fieldRecordGuard(request);
  if ("error" in auth) return auth.error;
  const body = await readSmallJson(request) as { files?: unknown; idempotencyKey?: unknown } | null;
  if (!body || typeof body !== "object" || typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,120}$/.test(body.idempotencyKey) || !Array.isArray(body.files))
    return fieldRecordReply(400, "업로드 정보를 확인해 주세요.");
  const files = body.files.map((item) => {
    const file = (item ?? {}) as { durationSeconds?: unknown; mimeType?: unknown; size?: unknown };
    return { durationSeconds: typeof file.durationSeconds === "number" ? file.durationSeconds : undefined, mimeType: typeof file.mimeType === "string" ? file.mimeType : "", size: typeof file.size === "number" ? file.size : Number.NaN };
  });
  try {
    const result = await createUploadTargets(auth.companyId, body.idempotencyKey, files);
    if (!result.ok) return fieldRecordReply(400, result.message ?? "사진·영상을 확인해 주세요.");
    return NextResponse.json({ uploads: result.uploads }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fieldRecordReply(503, "업로드 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
