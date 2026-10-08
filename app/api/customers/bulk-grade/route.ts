import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateCustomerGrade } from "@/lib/customer/application/bulk-update-customer-grade";
import { storeCustomerGradeRepository } from "@/lib/customer/infrastructure/store-customer-grade-repository";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerIds?: string[]; grade?: unknown } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 수정할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const result = await bulkUpdateCustomerGrade(storeCustomerGradeRepository, {
      companyId: scope.companyId,
      customerIds: Array.isArray(body?.customerIds) ? body.customerIds : [],
      grade: body?.grade
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "등급 일괄 변경에 실패했습니다.";
    const isValidationError = message === "선택된 거래처가 없습니다." || message === "등급은 A, B, C 중에서 선택하세요.";
    return NextResponse.json({ message }, { status: isValidationError ? 400 : 500 });
  }
}
