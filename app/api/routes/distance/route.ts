import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getCompanyOriginAddress, saveRouteDistanceCache } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const destinationAddress = String(body?.destinationAddress || "").trim();

  if (!destinationAddress) {
    return NextResponse.json({ error: "목적지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = scope.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const result = await calculateRouteDistance(originAddress, destinationAddress);
  const saved = await saveRouteDistanceCache(companyId, result, {
    customerId: body?.customerId || null
  });

  return NextResponse.json({
    route: saved
  });
}
