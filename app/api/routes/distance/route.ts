import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { canAccessAssignedCustomer, getCompanyOriginAddress, saveRouteDistanceCache } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const destinationAddress = String(body?.destinationAddress || "").trim();

  if (!destinationAddress) {
    return NextResponse.json({ error: "목적지 주소가 필요합니다." }, { status: 400 });
  }
  const customerId = typeof body?.customerId === "string" ? body.customerId : "";
  if (customerId) {
    const canAccess = await canAccessAssignedCustomer(scope.companyId, customerId, getCustomerAssignmentKeys(scope.customerSession));
    if (!canAccess) {
      return NextResponse.json({ error: "담당 거래처의 거리만 계산할 수 있습니다." }, { status: 403 });
    }
  }

  const companyId = scope.companyId;
  const customerId = typeof body?.customerId === "string" ? body.customerId : "";
  if (customerId) {
    const canAccess = await canAccessAssignedCustomer(scope.companyId, customerId, getCustomerAssignmentKeys(scope.customerSession));
    if (!canAccess) {
      return NextResponse.json({ error: "담당 거래처의 거리만 계산할 수 있습니다." }, { status: 403 });
    }
  }
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const result = await calculateRouteDistance(originAddress, destinationAddress);
  const saved = await saveRouteDistanceCache(companyId, result, {
    customerId: customerId || null
  });

  return NextResponse.json({
    route: saved
  });
}
