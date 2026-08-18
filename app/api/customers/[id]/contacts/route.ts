import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { listCustomerContacts, upsertCustomerContact } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET: 거래처 하나의 다중 연락처(대표/실장/부장/매니저 등) 목록을 반환합니다.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const contacts = await listCustomerContacts(scope.companyId!, id);
  return NextResponse.json({ contacts });
}

// POST: 새 연락처를 추가합니다(대표 연락처 외 추가 담당자).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; isPrimary?: boolean; memo?: string; name?: string; phone?: string; role?: string }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "연락처를 등록할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.name?.trim()) {
    return NextResponse.json({ message: "담당자 이름은 필수입니다." }, { status: 400 });
  }

  try {
    const result = await upsertCustomerContact(scope.companyId!, id, {
      isPrimary: body.isPrimary,
      memo: body.memo,
      name: body.name,
      phone: body.phone,
      role: body.role || "담당자"
    });
    if (!result.ok) return NextResponse.json({ message: result.message || "연락처 저장에 실패했습니다." }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("customer contact create failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "연락처 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}
