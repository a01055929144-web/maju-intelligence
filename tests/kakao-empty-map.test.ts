import { describe, expect, it } from "vitest";
import { shouldShowMarkerGeocodingFailure } from "../lib/map-empty-state";

describe("Kakao map empty-state classification", () => {
  it("does not treat a new company with no stores as a map failure", () => {
    expect(shouldShowMarkerGeocodingFailure({
      found: 0,
      hasRoadPath: false,
      hasSalesAreaBoundary: false,
      markers: []
    })).toBe(false);
    expect(shouldShowMarkerGeocodingFailure({
      found: 0,
      hasRoadPath: false,
      hasSalesAreaBoundary: false,
      markers: [{ tone: "origin" }]
    })).toBe(false);
  });

  it("still reports a real geocoding failure when store markers cannot be placed", () => {
    expect(shouldShowMarkerGeocodingFailure({
      found: 0,
      hasRoadPath: false,
      hasSalesAreaBoundary: false,
      markers: [{ tone: "customer" }]
    })).toBe(true);
  });
});
