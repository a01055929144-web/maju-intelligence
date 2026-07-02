import { NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getCompanyOriginAddress } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

type RoutePoint = {
  lat: number;
  lng: number;
};

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
  const path: RoutePoint[] = [];
  let currentAddress = originAddress;

  for (let index = 0; index < destinations.length; index += 1) {
    const destinationAddress = destinations[index];
    const result = await calculateRouteDistance(currentAddress, destinationAddress);
    path.push(...extractRoutePath(result.routeGeometry));
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
      path: dedupePath(path),
      stops: destinations,
      totalDistanceKm,
      totalDurationMinutes
    }
  });
}

function extractRoutePath(routeGeometry: unknown): RoutePoint[] {
  if (!Array.isArray(routeGeometry)) return [];

  return routeGeometry.flatMap((geometry) => {
    if (!geometry || typeof geometry !== "object") return [];

    const candidate = geometry as { coordinates?: unknown; type?: string };
    if (candidate.type === "LineString" && Array.isArray(candidate.coordinates)) {
      return coordinatesToPoints(candidate.coordinates);
    }

    if (candidate.type === "MultiLineString" && Array.isArray(candidate.coordinates)) {
      return candidate.coordinates.flatMap((coordinates) => coordinatesToPoints(coordinates));
    }

    return [];
  });
}

function coordinatesToPoints(coordinates: unknown): RoutePoint[] {
  if (!Array.isArray(coordinates)) return [];

  return coordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    })
    .filter((point): point is RoutePoint => Boolean(point));
}

function dedupePath(path: RoutePoint[]) {
  return path.filter((point, index) => {
    const previous = path[index - 1];
    return !previous || previous.lat !== point.lat || previous.lng !== point.lng;
  });
}
