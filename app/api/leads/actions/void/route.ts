import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { voidLeadAction } from "@/lib/store";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { actionId?: string; companyId?: string; reason?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales") && !scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "기록을 취소할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.actionId || !UUID.test(body.actionId)) return NextResponse.json({ message: "취소할 기록을 확인해 주세요." }, { status: 400 });
  const actor = scope.customerSession?.name || scope.adminSession?.name || "관리자";
  try {
    const result = await voidLeadAction(scope.companyId, body.actionId, actor, (body.reason || "잘못 기록").slice(0, 200));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("이미") ? error.message : "기록을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
