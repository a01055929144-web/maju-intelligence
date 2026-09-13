import { describe, expect, it } from "vitest";
import {
  clamp,
  deliveryCostRatio,
  deliveryWorthLabel,
  estimateFuelCostWon,
  formatDistanceKmLabel,
  formatMinutes,
  getStoreTotals,
  haversineKm,
  roundToSix
} from "../lib/route-map-utils";

describe("route map utilities", () => {
  it("preserves route total and display calculations", () => {
    expect(getStoreTotals([
      { distanceKm: 1.24, durationMinutes: 10, expectedRevenue: 100 },
      { distanceKm: 2.31, durationMinutes: 20, expectedRevenue: 200 }
    ])).toEqual({ distanceKm: 3.6, durationMinutes: 30, expectedRevenue: 300 });
    expect(formatMinutes(90)).toBe("1시간 30분");
    expect(formatDistanceKmLabel(0)).toBe("거리 확인 필요");
  });

  it("preserves distance, fuel, and delivery-worth calculations", () => {
    expect(haversineKm(37.5665, 126.978, 37.5665, 126.978)).toBe(0);
    expect(estimateFuelCostWon(15, 1_700)).toBe(3_400);
    expect(deliveryCostRatio(10_000, 10)).toBe(0.1);
    expect(deliveryWorthLabel(0.1).label).toBe("적정 범위");
    expect(clamp(12, 0, 10)).toBe(10);
    expect(roundToSix(37.12345678)).toBe(37.123457);
  });
});
