import type { KakaoMapMarker } from "@/components/kakao-address-map";

type RouteMapStop = {
  readonly address?: string;
  readonly name: string;
  readonly order: number;
};

export function createRouteMapMarkers(originAddress: string, stops: ReadonlyArray<RouteMapStop>): KakaoMapMarker[] {
  const routeStops = stops
    .filter((stop) => stop.address)
    .map((stop, index) => ({
      address: stop.address || "",
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
