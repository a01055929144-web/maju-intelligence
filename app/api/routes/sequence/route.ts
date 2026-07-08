import { NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { getCompanyOriginAddress } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

type RoutePoint = {
  lat: number;
  lng: number;
};

type RouteLegResult = Awaited<ReturnType<typeof calculateRouteDistance>>;

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
  ).slice(0, 15);

  if (!destinations.length) {
    return NextResponse.json({ error: "경유지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = customerSession?.companyId || body?.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const optimizedLegs = await optimizeRouteLegs(originAddress, destinations);
  const legs = optimizedLegs.map(({ destinationAddress, fromAddress, order, result }) => ({
    distanceKm: result.distanceKm,
    durationMinutes: result.durationMinutes,
    fromAddress,
    order,
    provider: result.provider,
    toAddress: destinationAddress
  }));
  const path = optimizedLegs.flatMap(({ result }, index) => {
    const legPath = extractRoutePath(result.routeGeometry);
    return index ? [{ lat: Number.NaN, lng: Number.NaN }, ...legPath] : legPath;
  });
  const optimizedStops = optimizedLegs.map(({ destinationAddress }) => destinationAddress);

  const totalDistanceKm = Math.round(legs.reduce((total, leg) => total + Number(leg.distanceKm || 0), 0) * 10) / 10;
  const totalDurationMinutes = legs.reduce((total, leg) => total + Number(leg.durationMinutes || 0), 0);

  return NextResponse.json({
    routeSequence: {
      legs,
      originAddress,
      path: dedupePath(path),
      stops: optimizedStops,
      totalDistanceKm,
      totalDurationMinutes
    }
  });
}

async function optimizeRouteLegs(originAddress: string, destinations: string[]) {
  const optimizedLegs: Array<{
    destinationAddress: string;
    fromAddress: string;
    order: number;
    result: RouteLegResult;
  }> = [];
  const remaining = [...destinations];
  let currentAddress = originAddress;

  while (remaining.length) {
    const candidates = await Promise.all(
      remaining.map(async (destinationAddress) => ({
        destinationAddress,
        result: await calculateRouteDistance(currentAddress, destinationAddress)
      }))
    );
    const next = candidates.sort((a, b) => a.result.distanceKm - b.result.distanceKm || a.result.durationMinutes - b.result.durationMinutes)[0];
    const nextIndex = remaining.indexOf(next.destinationAddress);

    if (nextIndex >= 0) remaining.splice(nextIndex, 1);
    optimizedLegs.push({
      destinationAddress: next.destinationAddress,
      fromAddress: currentAddress,
      order: optimizedLegs.length + 1,
      result: next.result
    });
    currentAddress = next.destinationAddress;
  }

  return optimizedLegs;
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
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return true;
    const previous = path[index - 1];
    if (!previous || !Number.isFinite(previous.lat) || !Number.isFinite(previous.lng)) return true;
    return !previous || previous.lat !== point.lat || previous.lng !== point.lng;
  });
}
