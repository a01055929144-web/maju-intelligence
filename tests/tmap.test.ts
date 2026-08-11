import { describe, expect, it } from "vitest";
import { haversineDistanceKm } from "../lib/tmap";

describe("haversineDistanceKm", () => {
  it("returns 0 for identical points", () => {
    const point = { lat: 37.5445, lng: 127.0567 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it("returns a roughly correct distance between two known Seoul points", () => {
    // 성수역 -> 강남역, real road/straight-line distance is roughly 6-7km.
    const seongsu = { lat: 37.5445, lng: 127.0557 };
    const gangnam = { lat: 37.4979, lng: 127.0276 };
    const distance = haversineDistanceKm(seongsu, gangnam);
    expect(distance).toBeGreaterThan(4);
    expect(distance).toBeLessThan(8);
  });

  it("is symmetric", () => {
    const a = { lat: 37.5445, lng: 127.0557 };
    const b = { lat: 37.4979, lng: 127.0276 };
    expect(haversineDistanceKm(a, b)).toBe(haversineDistanceKm(b, a));
  });
});
