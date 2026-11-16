export type RoutePlanStop = {
  id: string;
  name: string;
  region: string;
  score: number;
  reasons?: string[];
  status: string;
  expectedRevenue: number;
  address?: string;
  birthDate?: string;
  businessNumber?: string;
  businessStatus?: string;
  deliveryArea?: string;
  deliveryAddress?: string;
  deliveryDriver?: string;
  deliveryVehicle?: string;
  distanceKm?: number;
  durationMinutes?: number;
  email?: string;
  industry?: string;
  loadingPosition?: string;
  accessMethodType?: string;
  accessNote?: string;
  accessPassword?: string;
  hasAccessPassword?: boolean;
  businessHours?: string;
  menuSummary?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  openingDate?: string;
  order: number;
  phone?: string;
  relationshipStatus?: string;
  representativeName?: string;
  reviewSummary?: string;
  reviewKeywords?: string[];
  reviewSource?: string;
  reviewsUpdatedAt?: string;
  routeCalculatedAt?: string;
  routeProvider?: "tmap" | "estimated" | "cached";
  updatedAt?: string;
};

export type RoutePlanGroup = {
  region: string;
  stops: RoutePlanStop[];
  expectedRevenue: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
};

export type RoutePlan = {
  groups: RoutePlanGroup[];
  source: "empty" | "supabase";
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalExpectedRevenue: number;
  totalStops: number;
};

type RouteCustomer = {
  id: string;
  address: string;
  birthDate?: string;
  businessNumber?: string;
  businessStatus?: string;
  businessHours?: string;
  customerName: string;
  deliveryKm: number;
  deliveryManager?: string;
  deliveryMinutes?: number;
  deliveryVehicle?: string;
  deliveryZone?: string;
  email?: string;
  grade: "A" | "B" | "C";
  industry: string;
  loadingPosition?: string;
  accessMethodType?: string;
  accessNote?: string;
  hasAccessPassword?: boolean;
  menuSummary?: string;
  monthlyRevenue: number;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  openingDate?: string;
  phone?: string;
  region: string;
  relationshipStatus?: string;
  representativeName?: string;
  reviewSummary?: string;
  reviewKeywords?: string[];
  reviewSource?: string;
  reviewsUpdatedAt?: string;
  updatedAt?: string;
};

type RouteCacheEntry = {
  calculatedAt: string;
  distanceKm: number;
  durationMinutes: number;
};

type RouteConfirmationRequest = (path: string) => Promise<unknown>;

export async function readRouteOrderConfirmationMap(
  request: RouteConfirmationRequest,
  companyId: string,
  routeDate: string
): Promise<Map<string, string[]>> {
  const rows = await request(
    `route_plan_confirmations?select=driver_name,customer_ids&company_id=eq.${encodeURIComponent(companyId)}&route_date=eq.${routeDate}`
  ).catch(() => []) as Array<{ driver_name: string; customer_ids: unknown }>;

  const confirmations = new Map<string, string[]>();
  for (const row of rows) {
    if (Array.isArray(row.customer_ids)) confirmations.set(row.driver_name, row.customer_ids as string[]);
  }
  return confirmations;
}

export function buildTodayRoutePlan(
  customers: RouteCustomer[],
  source: RoutePlan["source"],
  routeCache: ReadonlyMap<string, RouteCacheEntry>,
  routeOrderConfirmations: ReadonlyMap<string, string[]>,
  deliveryAddressById: ReadonlyMap<string, string> = new Map()
): RoutePlan {
  const planned = customers
    .map((customer, index): RoutePlanStop => {
      const address = customer.address || `${customer.region || "미분류"} ${customer.customerName}`;
      const cached = routeCache.get(address);
      const distanceKm = cached?.distanceKm ?? customer.deliveryKm;
      const driverKey = (customer.deliveryManager || "").trim();
      const confirmedIds = driverKey ? routeOrderConfirmations.get(driverKey) : undefined;
      const confirmedPosition = confirmedIds?.indexOf(customer.id) ?? -1;
      const order = confirmedIds ? (confirmedPosition >= 0 ? confirmedPosition + 1 : 10000 + index) : index + 1;

      return {
        id: customer.id || `customer-${index + 1}`,
        name: customer.customerName,
        region: customer.region || "미분류",
        score: Math.max(50, Math.min(99, Math.round(Number(customer.monthlyRevenue || 0) / 5))),
        reasons: ["거래처 원장 기준", customer.grade ? `${customer.grade}등급` : "등급 산정", customer.deliveryManager || "담당자 배정"],
        status: index < 15 ? "today" : "visit-planned",
        expectedRevenue: Number(customer.monthlyRevenue || 0),
        address,
        birthDate: customer.birthDate,
        businessNumber: customer.businessNumber,
        businessStatus: customer.businessStatus,
        distanceKm,
        durationMinutes: cached?.durationMinutes ?? customer.deliveryMinutes ?? estimateMinutesFromKm(distanceKm),
        email: customer.email,
        industry: customer.industry,
        deliveryAddress: deliveryAddressById.get(customer.id),
        loadingPosition: customer.loadingPosition,
        accessMethodType: customer.accessMethodType,
        accessNote: customer.accessNote,
        hasAccessPassword: customer.hasAccessPassword,
        businessHours: customer.businessHours,
        menuSummary: customer.menuSummary,
        naverPlaceUrl: customer.naverPlaceUrl,
        kakaoPlaceUrl: customer.kakaoPlaceUrl,
        googleMapUrl: customer.googleMapUrl,
        openingDate: customer.openingDate,
        phone: customer.phone,
        relationshipStatus: customer.relationshipStatus,
        representativeName: customer.representativeName,
        reviewSummary: customer.reviewSummary,
        reviewKeywords: customer.reviewKeywords,
        reviewSource: customer.reviewSource,
        reviewsUpdatedAt: customer.reviewsUpdatedAt,
        deliveryArea: customer.deliveryZone || customer.region || "미분류",
        deliveryDriver: customer.deliveryManager,
        deliveryVehicle: customer.deliveryVehicle,
        order,
        routeCalculatedAt: cached?.calculatedAt,
        routeProvider: cached ? "cached" : "estimated",
        updatedAt: customer.updatedAt
      };
    })
    .filter((stop) => {
      const driverKey = (stop.deliveryDriver || "").trim();
      const confirmedIds = driverKey ? routeOrderConfirmations.get(driverKey) : undefined;
      return confirmedIds === undefined || confirmedIds.includes(stop.id);
    });

  const grouped = new Map<string, RoutePlanStop[]>();
  for (const stop of planned) {
    grouped.set(stop.region || "미분류", [...(grouped.get(stop.region || "미분류") || []), stop]);
  }

  const groups = Array.from(grouped.entries())
    .map(([region, stops]) => ({
      region,
      stops,
      expectedRevenue: stops.reduce((total, stop) => total + stop.expectedRevenue, 0),
      totalDistanceKm: roundToOneDecimal(stops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: stops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
    }))
    .sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  return {
    groups,
    source,
    totalDistanceKm: roundToOneDecimal(planned.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
    totalDurationMinutes: planned.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0),
    totalExpectedRevenue: planned.reduce((total, stop) => total + stop.expectedRevenue, 0),
    totalStops: planned.length
  };
}

function estimateMinutesFromKm(distanceKm?: number) {
  if (!distanceKm) return undefined;
  return Math.max(10, Math.round(distanceKm * 2.2));
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
