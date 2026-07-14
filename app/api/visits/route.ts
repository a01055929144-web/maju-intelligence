import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { saveVisitResult, VisitResult } from "@/lib/store";

const allowedResults: VisitResult[] = ["visited", "interested", "quote-requested", "pending", "failed"];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    expectedRevenue?: number;
    leadId?: string;
    memo?: string;
    nextAction?: string;
    result?: VisitResult;
    companyId?: string;
  } | null;
  const scope = getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!body?.leadId || !body.result || !allowedResults.includes(body.result)) {
    return NextResponse.json({ message: "Invalid visit result" }, { status: 400 });
  }

  const result = await saveVisitResult({
    companyId: scope.companyId,
    expectedRevenue: body.expectedRevenue,
    leadId: body.leadId,
    memo: body.memo,
    nextAction: body.nextAction,
    result: body.result
  });

  return NextResponse.json({ ok: true, result });
}
