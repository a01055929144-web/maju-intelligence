import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getSalesTransactions } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "view_company_operations")) {
    return NextResponse.json({ message: "회사 전체 매출 원장은 대표 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  const offsetParam = request.nextUrl.searchParams.get("offset");
  const offset = offsetParam ? Math.max(0, Number.parseInt(offsetParam, 10) || 0) : 0;
  const from = request.nextUrl.searchParams.get("from") || undefined;
  const to = request.nextUrl.searchParams.get("to") || undefined;

  return NextResponse.json({
    companyId: scope.companyId,
    sales: await getSalesTransactions(scope.companyId, { offset, from, to })
  });
}
