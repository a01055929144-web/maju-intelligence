import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getCompanyOriginAddress } from "@/lib/store";
import { calculateRouteDistance, GeoPoint, haversineDistanceKm, resolveAddressPoint } from "@/lib/tmap";

type RoutePoint = {
  lat: number;
  lng: number;
};

type RouteLegResult = Awaited<ReturnType<typeof calculateRouteDistance>>;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawDestinations = Array.isArray(body?.destinations) ? body.destinations : [];
  const destinations = Array.from(
    new Set<string>(rawDestinations.map((address: unknown) => String(address || "").trim()).filter(Boolean))
  ).slice(0, 15);

  if (!destinations.length) {
    return NextResponse.json({ error: "경유지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = scope.companyId;
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
  // Geocode every unique address exactly once up front. Previously this ran inside the
  // nearest-neighbor loop below, re-geocoding the same addresses O(n^2) times (up to ~100+
  // Tmap calls for 15 stops). Ordering candidates now uses a free local haversine distance
  // over these cached points, and Tmap's paid routing API is only called once per final leg.
  const uniqueAddresses = Array.from(new Set([originAddress, ...destinations]));
  const geoPoints = new Map<string, GeoPoint | null>(
    await Promise.all(uniqueAddresses.map(async (address) => [address, await resolveAddressPoint(address)] as const))
  );

  const order: string[] = [];
  const remaining = [...destinations];
  let currentAddress = originAddress;

  while (remaining.length) {
    const currentPoint = geoPoints.get(currentAddress) || null;
    const next = remaining.reduce((best, candidate) => {
      const candidatePoint = geoPoints.get(candidate) || null;
      const candidateDistance = currentPoint && candidatePoint ? haversineDistanceKm(currentPoint, candidatePoint) : Number.POSITIVE_INFINITY;
      const bestPoint = geoPoints.get(best) || null;
      const bestDistance = currentPoint && bestPoint ? haversineDistanceKm(currentPoint, bestPoint) : Number.POSITIVE_INFINITY;
      return candidateDistance < bestDistance ? candidate : best;
    }, remaining[0]);

    const nextIndex = remaining.indexOf(next);
    if (nextIndex >= 0) remaining.splice(nextIndex, 1);
    order.push(next);
    currentAddress = next;
  }

  // Only the final, already-ordered legs get a real Tmap road-distance/duration call (n calls
  // total instead of n(n+1)/2), reusing the geo points resolved above.
  const optimizedLegs: Array<{
    destinationAddress: string;
    fromAddress: string;
    order: number;
    result: RouteLegResult;
  }> = [];
  let fromAddress = originAddress;

  for (const destinationAddress of order) {
    const result = await calculateRouteDistance(fromAddress, destinationAddress, {
      originPoint: geoPoints.get(fromAddress) ?? null,
      destinationPoint: geoPoints.get(destinationAddress) ?? null
    });
    optimizedLegs.push({
      destinationAddress,
      fromAddress,
      order: optimizedLegs.length + 1,
      result
    });
    fromAddress = destinationAddress;
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
