import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getLatestReport } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "view_company_operations")) {
    return NextResponse.json({ message: "회사 전체 AI 리포트는 대표 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  return NextResponse.json(await getLatestReport(scope.companyId));
}
