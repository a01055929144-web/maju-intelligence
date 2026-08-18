import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { PermitLeadActionType, recordPermitLeadAction } from "@/lib/store";

const VALID_ACTION_TYPES: PermitLeadActionType[] = ["call", "dm", "visit", "hold", "exclude"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { actionType?: string; actorName?: string; companyId?: string; memo?: string; result?: string }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "영업 결과를 기록할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.actionType || !VALID_ACTION_TYPES.includes(body.actionType as PermitLeadActionType)) {
    return NextResponse.json({ message: "올바르지 않은 액션입니다." }, { status: 400 });
  }

  try {
    const result = await recordPermitLeadAction(scope.companyId!, id, {
      actionType: body.actionType as PermitLeadActionType,
      result: body.result,
      memo: body.memo,
      actorName: body.actorName || scope.customerSession?.name || scope.adminSession?.name || undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead action failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
