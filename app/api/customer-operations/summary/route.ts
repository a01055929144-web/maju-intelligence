import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getCustomerOperationsSummary } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get("customerIds") || "";
  const customerIds = idsParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!customerIds.length) {
    return NextResponse.json({ summary: {} });
  }

  const summary = await getCustomerOperationsSummary(customerIds, scope.companyId);
  return NextResponse.json({ summary });
}
