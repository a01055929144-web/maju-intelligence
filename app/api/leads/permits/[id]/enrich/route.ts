import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { resolveLeadContactActorName } from "@/domains/lead/lead-action";
import { enrichPermitLeadExternalInfo, updatePermitLeadKakaoMatch } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { companyId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "리드 정보를 보강할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await enrichPermitLeadExternalInfo(scope.companyId!, id, {
      actorName: resolveLeadContactActorName([
        getCustomerOperationalName(scope.customerSession),
        scope.customerSession?.name,
        scope.adminSession?.name
      ]),
      actorUserId: scope.customerSession?.userId,
      source: "manual"
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead enrich failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "외부 정보 보강 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: "apply_suggestion" | "reject_match";
    companyId?: string;
  } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) {
    return NextResponse.json({ message: "카카오 매칭을 변경할 권한이 없습니다." }, { status: 403 });
  }
  if (body?.action !== "apply_suggestion" && body?.action !== "reject_match") {
    return NextResponse.json({ message: "처리할 매칭 작업을 선택해주세요." }, { status: 400 });
  }

  try {
    const result = await updatePermitLeadKakaoMatch(scope.companyId!, id, body.action, {
      actorName: resolveLeadContactActorName([
        getCustomerOperationalName(scope.customerSession),
        scope.customerSession?.name,
        scope.adminSession?.name
      ]),
      actorUserId: scope.adminSession ? undefined : scope.customerSession?.userId,
      source: "manual",
      trigger: "manual"
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("permit lead Kakao match update failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "카카오 매칭 변경 중 오류가 발생했습니다." }, { status: 500 });
  }
}
