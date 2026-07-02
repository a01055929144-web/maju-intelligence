import { NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getCompanyOriginAddress } from "@/lib/store";
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
  ).slice(0, 10);

  if (!destinations.length) {
    return NextResponse.json({ error: "경유지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = customerSession?.companyId || body?.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const legs = [];
  let currentAddress = originAddress;

  for (let index = 0; index < destinations.length; index += 1) {
    const destinationAddress = destinations[index];
    const result = await calculateRouteDistance(currentAddress, destinationAddress);
    legs.push({
      distanceKm: result.distanceKm,
      durationMinutes: result.durationMinutes,
      fromAddress: currentAddress,
      order: index + 1,
      provider: result.provider,
      toAddress: destinationAddress
    });
    currentAddress = destinationAddress;
  }

  const totalDistanceKm = Math.round(legs.reduce((total, leg) => total + Number(leg.distanceKm || 0), 0) * 10) / 10;
  const totalDurationMinutes = legs.reduce((total, leg) => total + Number(leg.durationMinutes || 0), 0);

  return NextResponse.json({
    routeSequence: {
      legs,
      originAddress,
      stops: destinations,
      totalDistanceKm,
      totalDurationMinutes
    }
  });
}
