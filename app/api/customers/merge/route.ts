import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { mergeDuplicateCustomers } from "@/lib/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; primaryCustomerId?: string; duplicateCustomerIds?: string[] } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 병합할 권한이 없습니다." }, { status: 403 });
  }

  if (!body?.primaryCustomerId) {
    return NextResponse.json({ message: "기준 거래처를 지정하세요." }, { status: 400 });
  }
  const duplicateIds = Array.isArray(body.duplicateCustomerIds) ? body.duplicateCustomerIds.filter((id): id is string => typeof id === "string" && Boolean(id)) : [];
  if (!duplicateIds.length) {
    return NextResponse.json({ message: "병합할 중복 거래처를 선택하세요." }, { status: 400 });
  }

  try {
    const result = await mergeDuplicateCustomers(scope.companyId, body.primaryCustomerId, duplicateIds);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "병합에 실패했습니다." }, { status: 400 });
  }
}
