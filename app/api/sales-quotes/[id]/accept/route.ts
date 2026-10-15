import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { acceptSalesQuote } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "견적을 수락 처리할 권한이 없습니다." }, { status: 403 });
  try {
    const { id } = await params;
    const result = await acceptSalesQuote(scope.companyId!, id, getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name);
    return NextResponse.json({
      ...result,
      message: result.pendingCustomerConversion
        ? "수락 처리했습니다. 거래처 전환 후 계약 단가가 자동 반영됩니다."
        : `수락 처리했습니다. 계약 단가 ${result.appliedCount}개를 반영했습니다.${result.unlinkedCount ? ` 표준 품목 연결 필요 ${result.unlinkedCount}개` : ""}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "견적을 수락 처리하지 못했습니다.";
    return NextResponse.json({ message }, { status: /찾지 못|이 회사/.test(message) ? 404 : /발행한/.test(message) ? 409 : 500 });
  }
}
