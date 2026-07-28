import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
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
