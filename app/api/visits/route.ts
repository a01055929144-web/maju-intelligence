import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { saveVisitResult, VisitResult } from "@/lib/store";

const allowedResults: VisitResult[] = ["visited", "interested", "quote-requested", "pending", "failed"];

export async function POST(request: NextRequest) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    expectedRevenue?: number;
    leadId?: string;
    memo?: string;
    nextAction?: string;
    result?: VisitResult;
  } | null;

  if (!body?.leadId || !body.result || !allowedResults.includes(body.result)) {
    return NextResponse.json({ message: "Invalid visit result" }, { status: 400 });
  }

  const result = await saveVisitResult({
    companyId: customerSession?.companyId,
    expectedRevenue: body.expectedRevenue,
    leadId: body.leadId,
    memo: body.memo,
    nextAction: body.nextAction,
    result: body.result
  });

  return NextResponse.json({ ok: true, result });
}

