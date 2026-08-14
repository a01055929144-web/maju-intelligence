import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { addBusinessNumberException, getBusinessNumberExceptions, removeBusinessNumberException } from "@/lib/store";

export async function GET(request: NextRequest) {
  const queryCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, queryCompanyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const result = await getBusinessNumberExceptions(scope.companyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; businessRegistrationNumber?: string; memo?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_company")) {
    return NextResponse.json({ message: "중복 허용 사업자번호를 등록할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.businessRegistrationNumber?.trim()) {
    return NextResponse.json({ message: "사업자등록번호를 입력하세요." }, { status: 400 });
  }

  try {
    const result = await addBusinessNumberException(scope.companyId, body.businessRegistrationNumber, body.memo || "", {
      actorName: scope.customerSession?.name,
      actorRole: scope.customerSession?.workspaceRole
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const queryCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const exceptionId = request.nextUrl.searchParams.get("id") || "";
  const scope = await getRequestAuthScope(request, queryCompanyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_company")) {
    return NextResponse.json({ message: "중복 허용 사업자번호를 삭제할 권한이 없습니다." }, { status: 403 });
  }
  if (!exceptionId) {
    return NextResponse.json({ message: "삭제할 항목 ID가 필요합니다." }, { status: 400 });
  }

  try {
    await removeBusinessNumberException(scope.companyId, exceptionId, {
      actorName: scope.customerSession?.name,
      actorRole: scope.customerSession?.workspaceRole
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제에 실패했습니다." }, { status: 400 });
  }
}
