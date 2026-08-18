import type { KakaoMapMarker } from "@/components/kakao-address-map";

type RouteMapStop = {
  readonly address?: string;
  readonly id?: string;
  readonly name: string;
  readonly order: number;
};

type CustomerLedgerMapItem = {
  readonly address: string;
  readonly customerName: string;
  readonly grade: "A" | "B" | "C";
  readonly id: string;
  readonly monthlyRevenue: number;
  readonly region: string;
};

export function createRouteMapMarkers(originAddress: string, stops: ReadonlyArray<RouteMapStop>): KakaoMapMarker[] {
  const routeStops = stops
    .filter((stop) => stop.address)
    .map((stop, index) => ({
      address: stop.address || "",
      id: stop.id,
      label: String(stop.order || index + 1),
      name: stop.name,
      tone: "customer" as const,
      x: 24 + ((index * 13) % 58),
      y: 28 + ((index * 17) % 44)
    }));

  return [
    {
      address: originAddress,
      label: "출발",
      name: "물류 출발지",
      tone: "origin",
      x: 72,
      y: 62
    },
    ...routeStops
  ];
}

export function createCustomerLedgerMapMarkers(originAddress: string, customers: ReadonlyArray<CustomerLedgerMapItem>): KakaoMapMarker[] {
  const customerMarkers = spreadMarkers(
    customers
      .filter((customer) => customer.address)
      .map((customer, index) => ({
        address: customer.address,
        grade: customer.grade,
        id: customer.id,
        label: customer.grade,
        name: `${customer.customerName} · 월 ${customer.monthlyRevenue.toLocaleString()}만원`,
        tone: "lead" as const,
        x: 18 + ((index * 11) % 68),
        y: 18 + ((index * 17) % 62)
      }))
  );

  return [
    {
      address: originAddress,
      label: "출발",
      name: "물류 출발지",
      tone: "origin",
      x: 72,
      y: 62
    },
    ...dedupeMarkers(customerMarkers)
  ];
}

function spreadMarkers(markers: KakaoMapMarker[]) {
  const counts = new Map<string, number>();
  return markers.map((marker) => {
    const key = `${Math.round(marker.x / 3)}-${Math.round(marker.y / 3)}`;
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    if (count === 0) return marker;

    const angle = count * 1.9;
    const radius = 2.2 + (count % 4) * 0.7;
    return {
      ...marker,
      x: clamp(marker.x + Math.cos(angle) * radius, 4, 96),
      y: clamp(marker.y + Math.sin(angle) * radius, 6, 94)
    };
  });
}

function dedupeMarkers(markers: KakaoMapMarker[]) {
  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = `${marker.address}-${marker.name}-${marker.tone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
