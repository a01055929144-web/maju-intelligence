import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "../auth";
import { isFeatureEnabled } from "../feature-flags";

export const fieldRecordReply = (status: number, message: string) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

/** 기능 플래그(FIELD_RECORDS, 기본 OFF + 회사 allowlist) 뒤. 로그인한 실제 직원 계정만. 회사는 세션에서만 정한다. */
export async function fieldRecordGuard(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId || !scope.customerSession?.userId) return { error: fieldRecordReply(401, "로그인이 필요합니다.") };
  if (!isFeatureEnabled("FIELD_RECORDS", scope.companyId)) return { error: fieldRecordReply(404, "현장 기록 기능이 아직 열리지 않았습니다.") };
  return { companyId: scope.companyId, scope, session: scope.customerSession };
}

/** 작은 JSON 본문만 받는다. 파일은 이 경로를 거치지 않는다(함수 본문 한도·전송 비용). */
export async function readSmallJson(request: NextRequest, maxBytes = 16 * 1024): Promise<unknown | null> {
  if (request.headers.get("content-type")?.toLowerCase().split(";")[0].trim() !== "application/json") return null;
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) return null;
  const text = await request.text().catch(() => "");
  if (!text || Buffer.byteLength(text) > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}
