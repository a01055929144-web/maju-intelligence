import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { isStorePriceVisibilityEnabled } from "@/lib/store/07-store-price-visibility-feature";
import { getCompanyPriceVisibilityActor, listStorePriceVisibility, setStorePriceVisibility } from "@/lib/store/07-store-price-visibility";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase(); }
  catch { return false; }
}

async function scope() {
  const session = await getCustomerSession();
  if (!session) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!isStorePriceVisibilityEnabled(session.companyId))
    return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (!customerHasCapability(session, "manage_company"))
    return { error: NextResponse.json({ message: "매장 가격 공개를 관리할 권한이 없습니다." }, { status: 403 }) };
  const actor = await getCompanyPriceVisibilityActor({ companyId: session.companyId,
    companyMemberId: session.companyMemberId, userId: session.userId });
  if (!actor) return { error: NextResponse.json({ message: "점주 또는 관리자만 확인할 수 있습니다." }, { status: 403 }) };
  return { actor, session };
}

export async function GET() {
  try {
    const verified = await scope();
    if ("error" in verified) return verified.error;
    const stores = await listStorePriceVisibility(verified.session.companyId);
    return NextResponse.json({ pendingCount: stores.filter(item => item.status === "pending" && item.businessStatus !== "registration_pending").length,
      stores }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "새 매장 확인 목록을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
    const verified = await scope();
    if ("error" in verified) return verified.error;
    const body = await request.json().catch(() => null) as { action?: unknown; memo?: unknown; storeAccountId?: unknown } | null;
    const action = body?.action;
    const memo = typeof body?.memo === "string" ? body.memo.trim() : "";
    const storeAccountId = String(body?.storeAccountId || "");
    if ((action !== "confirm" && action !== "cancel") || !uuid.test(storeAccountId) || memo.length > 500)
      return NextResponse.json({ message: "확인 정보를 다시 확인해 주세요." }, { status: 400 });
    await setStorePriceVisibility({ action, actorCompanyMemberId: verified.actor.id,
      companyId: verified.session.companyId, memo, storeAccountId });
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("preopening")
      ? "개업 준비 매장은 대표번호로 먼저 확인해 주세요." : "가격 공개 상태를 저장하지 못했습니다.";
    return NextResponse.json({ message }, { status: 409 });
  }
}
