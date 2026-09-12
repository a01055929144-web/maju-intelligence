import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getUploadHistory } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, requestedCompanyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "view_company_operations")) {
    return NextResponse.json({ message: "회사 전체 등록 이력은 대표 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "10", 10);
  const limit = ([10, 30, 50, 100] as const).find((value) => value === requestedLimit) || 10;
  const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10) || 0);
  const rows = await getUploadHistory(scope.companyId, { limit: limit + 1, offset });
  const hasMore = rows.length > limit;
  const uploads = rows.slice(0, limit);
  return NextResponse.json({
    companyId: scope.companyId,
    hasMore,
    limit,
    offset,
    uploads
  });
}
