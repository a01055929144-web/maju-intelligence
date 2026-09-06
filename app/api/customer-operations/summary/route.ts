import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { canAccessAssignedCustomer, getCustomerOperationsSummary } from "@/lib/store";

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

  const assignmentKeys = getCustomerAssignmentKeys(scope.customerSession);
  const allowedCustomerIds = assignmentKeys?.length
    ? (
        await Promise.all(
          customerIds.map(async (customerId) => ({
            allowed: await canAccessAssignedCustomer(scope.companyId, customerId, assignmentKeys),
            customerId
          }))
        )
      )
        .filter((entry) => entry.allowed)
        .map((entry) => entry.customerId)
    : customerIds;
  const summary = await getCustomerOperationsSummary(allowedCustomerIds, scope.companyId);
  return NextResponse.json({ summary });
}
