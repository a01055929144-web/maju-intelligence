import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { deletePermitLead, updatePermitLeadProfile, type PermitLeadProfileInput } from "@/lib/store";

// 요청 본문에 실제로 들어온 칸만 수정합니다(보내지 않은 칸을 null로 지우지 않도록).
function pickPermitLeadProfileInput(body: Record<string, unknown> | null): PermitLeadProfileInput {
  const input: PermitLeadProfileInput = {};
  for (const key of ["businessNumber", "instagramUrl", "fax", "email", "naverTalktalkUrl"] as const) {
    if (!body || !(key in body)) continue;
    const value = body[key];
    input[key] = typeof value === "string" ? value.trim() : null;
  }
  return input;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; businessNumber?: string | null; instagramUrl?: string | null; fax?: string | null; email?: string | null; naverTalktalkUrl?: string | null }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await updatePermitLeadProfile(
      scope.companyId!,
      id,
      pickPermitLeadProfileInput(body),
      {
        actorName: resolveLeadContactActorName([
          getCustomerOperationalName(scope.customerSession),
          scope.customerSession?.name,
          scope.adminSession?.name
        ]),
        actorUserId: scope.customerSession?.userId,
        source: "manual"
      }
    );
    return NextResponse.json(result, { status: result.ok ? 200 : result.message === "리드를 찾을 수 없습니다." ? 404 : 400 });
  } catch (error) {
    console.error("permit lead update failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE: 잘못 들어온 리드(테스트/명백한 오탐)를 완전히 삭제합니다. 일반적인 "영업 제외"는
// 목록에서만 숨기는 액션(POST .../action, actionType=exclude)을 쓰고, 이 엔드포인트는
// 데이터 자체를 지워야 하는 경우에만 사용합니다.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드를 삭제할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await deletePermitLead(scope.companyId!, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead delete failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
