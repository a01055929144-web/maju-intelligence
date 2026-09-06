import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { getTodayRoutePlan } from "@/lib/store";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    routePlan: await getTodayRoutePlan(scope.companyId, { assignmentKeys: getCustomerAssignmentKeys(scope.customerSession) })
  });
}
