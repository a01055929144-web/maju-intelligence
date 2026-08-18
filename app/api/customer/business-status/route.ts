import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isBusinessStatusApiConfigured } from "@/lib/business-status";
import { refreshCustomerBusinessStatuses } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerIds?: string[] } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "사업자 상태를 조회할 권한이 없습니다." }, { status: 403 });
  }
  if (!isBusinessStatusApiConfigured()) {
    return NextResponse.json(
      { message: "사업자 상태 자동조회 API 키(NTS_BUSINESS_API_KEY)가 설정되지 않았습니다. 관리자에게 문의하세요." },
      { status: 501 }
    );
  }

  const result = await refreshCustomerBusinessStatuses(scope.companyId as string, body?.customerIds);
  return NextResponse.json(result);
}
