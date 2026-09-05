import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { scopeRoutePlanForSession } from "@/lib/customer-data-scope";
import { getTodayRoutePlan } from "@/lib/store";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const routePlan = await getTodayRoutePlan(scope.companyId);
  return NextResponse.json({
    routePlan: scopeRoutePlanForSession(routePlan, scope.customerSession)
  });
}
