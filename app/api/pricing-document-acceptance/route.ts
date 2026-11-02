import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../lib/auth";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { parseStaffDocumentAcceptance } from "../../../application/pricing/accept-document";
import { acceptPricingDocumentForStaff, staffAcceptanceChoices } from "../../../lib/pricing/document-acceptance";
import { isId } from "../../../domains/pricing/document";

export const dynamic = "force-dynamic";
async function staffScope(request: NextRequest) {
  const auth = await getRequestAuthScope(request);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !isFeatureEnabled("QUOTE_ACCEPTANCE", auth.companyId) || !isFeatureEnabled("PRICING", auth.companyId))
    return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(auth, "manage_sales"))
    return NextResponse.json({ message: "대신 수락할 권한이 없습니다." }, { status: 403 });
  const identity = auth.customerSession?.userId || auth.customerSession?.companyMemberId || auth.customerSession?.email || auth.adminSession?.email;
  if (!identity) return NextResponse.json({ message: "작성자를 확인해 주세요." }, { status: 403 });
  return { companyId: auth.companyId, actorKey: createHash("sha256").update(`${auth.companyId}:${auth.customerSession ? "customer" : "admin"}:${identity}`).digest("hex") };
}
export async function GET(request: NextRequest) {
  const scope = await staffScope(request);
  if (scope instanceof NextResponse) return scope;
  const documentId = request.nextUrl.searchParams.get("documentId") || undefined;
  if (documentId && !isId(documentId)) return NextResponse.json({ message: "문서 번호를 확인해 주세요." }, { status: 400 });
  try {
    return NextResponse.json({ result: await staffAcceptanceChoices(scope.companyId, documentId) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "수락할 문서를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 503 });
  }
}
export async function POST(request: NextRequest) {
  const scope = await staffScope(request);
  if (scope instanceof NextResponse) return scope;
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin)
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return NextResponse.json({ message: "요청이 너무 큽니다." }, { status: 413 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return NextResponse.json({ message: "요청이 너무 큽니다." }, { status: 413 });
    const input = parseStaffDocumentAcceptance(JSON.parse(raw));
    const result = await acceptPricingDocumentForStaff(scope.companyId, scope.actorKey, input);
    return NextResponse.json({ result, message: result.needsReview ? "수락 기록을 저장했습니다. 연결 확인이 필요해 주문 링크를 발급하지 않았습니다."
      : `${result.kind === "quote" ? "견적과 협의 단가" : "단가표 매장 연결"}를 수락 처리했습니다. 주문 링크는 별도로 발급해 주세요.` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수락을 처리하지 못했습니다.";
    const conflict = /idempotency_conflict/.test(message);
    const status = conflict ? 409 : /찾을 수 없습니다/.test(message) ? 404 : /확인해|보완해|JSON/.test(message) ? 400 : 503;
    return NextResponse.json({ message: conflict ? "같은 요청 번호의 내용이 다릅니다. 선택 내용을 확인해 주세요." : status === 503 ? "수락을 처리하지 못했습니다. 같은 요청으로 다시 시도해 주세요." : message }, { status });
  }
}
