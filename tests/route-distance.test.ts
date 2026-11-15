import { expect, it } from "vitest";
import { haversineKm, haversineMeters } from "../domains/route/distance";

it("computes great-circle distance", () => {
  expect(haversineMeters(37.5, 127, 37.5, 127)).toBe(0);
  // 위도 1도 ≈ 111.2km
  expect(haversineKm(37, 127, 38, 127)).toBeGreaterThan(111);
  expect(haversineKm(37, 127, 38, 127)).toBeLessThan(111.5);
  expect(haversineMeters(37, 127, 38, 127)).toBeCloseTo(haversineKm(37, 127, 38, 127) * 1000, 6);
});
