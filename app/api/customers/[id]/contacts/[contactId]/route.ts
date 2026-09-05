import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { deleteCustomerContact, upsertCustomerContact } from "@/lib/store";

// PATCH: 기존 연락처 정보(이름/직책/전화/메모/대표 여부)를 수정합니다.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { birthDate?: string; companyId?: string; isPrimary?: boolean; memo?: string; name?: string; phone?: string; role?: string }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "연락처를 수정할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.name?.trim()) {
    return NextResponse.json({ message: "담당자 이름은 필수입니다." }, { status: 400 });
  }

  try {
    const result = await upsertCustomerContact(scope.companyId!, id, {
      id: contactId,
      birthDate: body.birthDate,
      isPrimary: body.isPrimary,
      memo: body.memo,
      name: body.name,
      phone: body.phone,
      role: body.role || "담당자"
    });
    if (!result.ok) return NextResponse.json({ message: result.message || "연락처 수정에 실패했습니다." }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("customer contact update failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "연락처 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE: 연락처를 삭제합니다.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "연락처를 삭제할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await deleteCustomerContact(scope.companyId!, contactId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("customer contact delete failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
