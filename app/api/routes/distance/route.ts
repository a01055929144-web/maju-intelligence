import { NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getCompanyOriginAddress, saveRouteDistanceCache } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

export async function POST(request: Request) {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();

  if (!customerSession && !adminSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const destinationAddress = String(body?.destinationAddress || "").trim();

  if (!destinationAddress) {
    return NextResponse.json({ error: "목적지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = customerSession?.companyId || body?.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const result = await calculateRouteDistance(originAddress, destinationAddress);
  const saved = await saveRouteDistanceCache(companyId, result, {
    customerId: body?.customerId || null
  });

  return NextResponse.json({
    route: saved
  });
}
