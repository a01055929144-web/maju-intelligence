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
  const rawDestinations = Array.isArray(body?.destinations) ? body.destinations : [];
  const destinations = Array.from(
    new Set<string>(rawDestinations.map((address: unknown) => String(address || "").trim()).filter(Boolean))
  ).slice(0, 25);

  if (!destinations.length) {
    return NextResponse.json({ error: "계산할 목적지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = customerSession?.companyId || body?.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const routes = [];

  for (const destinationAddress of destinations) {
    const result = await calculateRouteDistance(originAddress, destinationAddress);
    const saved = await saveRouteDistanceCache(companyId, result);
    routes.push(saved);
  }

  const totalDistanceKm = Math.round(routes.reduce((total, route) => total + Number(route.distanceKm || 0), 0) * 10) / 10;
  const totalDurationMinutes = routes.reduce((total, route) => total + Number(route.durationMinutes || 0), 0);

  return NextResponse.json({
    routes,
    summary: {
      count: routes.length,
      totalDistanceKm,
      totalDurationMinutes
    }
  });
}
