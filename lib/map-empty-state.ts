export type MapMarkerTone = "customer" | "lead" | "origin" | "unregistered" | "vehicle";

export function shouldShowMarkerGeocodingFailure(input: {
  found: number;
  hasRoadPath: boolean;
  hasSalesAreaBoundary: boolean;
  markers: ReadonlyArray<{ tone: MapMarkerTone }>;
}) {
  if (input.found > 0 || input.hasRoadPath || input.hasSalesAreaBoundary) return false;
  return input.markers.some((marker) => marker.tone === "customer" || marker.tone === "lead" || marker.tone === "unregistered");
}
