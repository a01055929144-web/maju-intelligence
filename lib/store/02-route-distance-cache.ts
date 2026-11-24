import type { RouteDistanceResult } from "../tmap";
import { getDefaultCompanyId, isProductionStoreConfigured, supabaseRequest } from "./00-core";

export async function saveRouteDistanceCache(
  companyId: string | undefined,
  result: RouteDistanceResult,
  options: { customerId?: string | null } = {}
) {
  const resolvedCompanyId = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      ...result
    };
  }

  const rows = await supabaseRequest<
    Array<{
      calculated_at: string;
      distance_km: number | string;
      duration_minutes: number;
      id: string;
      provider: string;
    }>
  >("route_distance_cache?on_conflict=company_id,destination_address", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        company_id: resolvedCompanyId,
        customer_id: options.customerId || null,
        origin_address: result.originAddress,
        destination_address: result.destinationAddress,
        origin_lat: result.originPoint?.lat ?? null,
        origin_lng: result.originPoint?.lng ?? null,
        destination_lat: result.destinationPoint?.lat ?? null,
        destination_lng: result.destinationPoint?.lng ?? null,
        distance_km: result.distanceKm,
        duration_minutes: result.durationMinutes,
        provider: result.provider,
        route_geometry: result.routeGeometry,
        raw_response: result.rawResponse,
        calculated_at: new Date().toISOString()
      }
    ])
  });

  return {
    persisted: true,
    cacheId: rows[0]?.id,
    ...result,
    calculatedAt: rows[0]?.calculated_at
  };
}

export async function getRouteDistanceCacheMap(companyId: string) {
  const cache = new Map<
    string,
    {
      calculatedAt: string;
      distanceKm: number;
      durationMinutes: number;
    }
  >();

  if (!isProductionStoreConfigured()) return cache;

  const rows = await supabaseRequest<
    Array<{
      calculated_at: string;
      destination_address: string;
      distance_km: number | string;
      duration_minutes: number;
    }>
  >(
    `route_distance_cache?select=destination_address,distance_km,duration_minutes,calculated_at&company_id=eq.${encodeURIComponent(
      companyId
    )}&order=calculated_at.desc&limit=1000`
  ).catch(() => []);

  rows.forEach((row) => {
    if (!cache.has(row.destination_address)) {
      cache.set(row.destination_address, {
        calculatedAt: new Date(row.calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        distanceKm: Number(row.distance_km || 0),
        durationMinutes: Number(row.duration_minutes || 0)
      });
    }
  });

  return cache;
}
