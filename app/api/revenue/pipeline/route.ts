import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getRevenuePipeline, type RevenuePipeline } from "@/lib/store";

const emptyPipeline: RevenuePipeline = {
  conversionRate: 0,
  expectedRevenue: 0,
  failed: 0,
  interested: 0,
  items: [],
  pending: 0,
  quoteRequests: 0,
  weightedRevenue: 0
};

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "view_company_operations")) {
    return NextResponse.json({ message: "회사 전체 예상매출 파이프라인은 대표 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  try {
    return NextResponse.json({
      pipeline: await getRevenuePipeline(scope.companyId),
      persisted: true
    });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : "Revenue pipeline unavailable",
      persisted: false,
      pipeline: emptyPipeline
    });
  }
}
