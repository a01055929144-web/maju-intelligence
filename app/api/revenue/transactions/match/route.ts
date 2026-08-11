import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { matchSalesTransactionsToCustomer } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerKey?: string; customerId?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!body?.customerKey || !body?.customerId) {
    return NextResponse.json({ message: "customerKey와 customerId는 필수입니다." }, { status: 400 });
  }

  try {
    const result = await matchSalesTransactionsToCustomer(scope.companyId, body.customerKey, body.customerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "매칭 처리에 실패했습니다." }, { status: 400 });
  }
}
