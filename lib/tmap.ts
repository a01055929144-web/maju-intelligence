export type GeoPoint = {
  lat: number;
  lng: number;
};

export type RouteDistanceResult = {
  originAddress: string;
  destinationAddress: string;
  originPoint: GeoPoint | null;
  destinationPoint: GeoPoint | null;
  distanceKm: number;
  durationMinutes: number;
  provider: "tmap" | "estimated";
  routeGeometry: unknown;
  rawResponse: unknown;
};

type TmapGeoResponse = {
  coordinateInfo?: {
    coordinate?: Array<{
      lat?: string;
      lon?: string;
      newLat?: string;
      newLon?: string;
    }>;
  };
};

type TmapRouteResponse = {
  features?: Array<{
    geometry?: unknown;
    properties?: {
      totalDistance?: number;
      totalTime?: number;
    };
  }>;
};

const TMAP_BASE_URL = "https://apis.openapi.sk.com/tmap";

export async function calculateRouteDistance(originAddress: string, destinationAddress: string): Promise<RouteDistanceResult> {
  const normalizedOrigin = originAddress.trim();
  const normalizedDestination = destinationAddress.trim();
  const appKey = process.env.TMAP_API_KEY;

  if (!normalizedOrigin || !normalizedDestination) {
    throw new Error("출발지와 목적지 주소가 필요합니다.");
  }

  if (!appKey || appKey === "replace-with-tmap-api-key") {
    return estimateRouteDistance(normalizedOrigin, normalizedDestination);
  }

  try {
    const [originPoint, destinationPoint] = await Promise.all([
      geocodeTmapAddress(normalizedOrigin, appKey),
      geocodeTmapAddress(normalizedDestination, appKey)
    ]);

    if (!originPoint || !destinationPoint) {
      return estimateRouteDistance(normalizedOrigin, normalizedDestination);
    }

    const route = await requestTmapCarRoute(originPoint, destinationPoint, appKey);
    const summary = route.features?.find((feature) => feature.properties?.totalDistance || feature.properties?.totalTime)?.properties;
    const distanceKm = roundToOneDecimal(Number(summary?.totalDistance || 0) / 1000);
    const durationMinutes = Math.max(1, Math.round(Number(summary?.totalTime || 0) / 60));

    if (!distanceKm || !durationMinutes) {
      return estimateRouteDistance(normalizedOrigin, normalizedDestination);
    }

    return {
      originAddress: normalizedOrigin,
      destinationAddress: normalizedDestination,
      originPoint,
      destinationPoint,
      distanceKm,
      durationMinutes,
      provider: "tmap",
      routeGeometry: route.features?.map((feature) => feature.geometry).filter(Boolean) || null,
      rawResponse: route
    };
  } catch {
    return estimateRouteDistance(normalizedOrigin, normalizedDestination);
  }
}

async function geocodeTmapAddress(address: string, appKey: string): Promise<GeoPoint | null> {
  const url = new URL(`${TMAP_BASE_URL}/geo/fullAddrGeo`);
  url.searchParams.set("version", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("coordType", "WGS84GEO");
  url.searchParams.set("fullAddr", address);

  const response = await fetch(url, {
    headers: { appKey },
    cache: "no-store"
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as TmapGeoResponse;
  const coordinate = payload.coordinateInfo?.coordinate?.[0];
  const lat = Number(coordinate?.newLat || coordinate?.lat);
  const lng = Number(coordinate?.newLon || coordinate?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function requestTmapCarRoute(origin: GeoPoint, destination: GeoPoint, appKey: string): Promise<TmapRouteResponse> {
  const url = new URL(`${TMAP_BASE_URL}/routes`);
  url.searchParams.set("version", "1");
  url.searchParams.set("format", "json");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      appKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      endX: destination.lng,
      endY: destination.lat,
      reqCoordType: "WGS84GEO",
      resCoordType: "WGS84GEO",
      searchOption: "0",
      startX: origin.lng,
      startY: origin.lat,
      trafficInfo: "Y"
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Tmap route request failed: ${response.status}`);
  }

  return (await response.json()) as TmapRouteResponse;
}

function estimateRouteDistance(originAddress: string, destinationAddress: string): RouteDistanceResult {
  const seed = hashText(`${originAddress}-${destinationAddress}`);
  const distanceKm = roundToOneDecimal(8 + (seed % 280) / 10);
  const durationMinutes = Math.max(12, Math.round(distanceKm * 2.1 + (seed % 9)));

  return {
    originAddress,
    destinationAddress,
    originPoint: null,
    destinationPoint: null,
    distanceKm,
    durationMinutes,
    provider: "estimated",
    routeGeometry: null,
    rawResponse: {
      reason: "TMAP_API_KEY is missing or Tmap request failed. Deterministic operational estimate was used."
    }
  };
}

function hashText(value: string) {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 100000, 7);
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
