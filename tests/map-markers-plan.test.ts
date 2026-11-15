import { describe, expect, it } from "vitest";
import { CLUSTER_MIN_POINTS, planMarkers, type MapViewBox, type MarkerPoint } from "../domains/route/markers";

const view: MapViewBox = { east: 127.2, north: 37.7, south: 37.4, west: 126.8 };
const grid = (n: number): MarkerPoint[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, lat: 37.5 + (i % 50) * 0.0001, lng: 127 + Math.floor(i / 50) * 0.0001 }));

describe("planMarkers", () => {
  it("does not cluster small sets or close-up levels", () => {
    expect(planMarkers(grid(CLUSTER_MIN_POINTS), 7, view).clusters).toEqual([]);
    expect(planMarkers(grid(CLUSTER_MIN_POINTS + 50), 3, view).clusters).toEqual([]);
  });
  it("groups dense points when zoomed out and keeps every id exactly once", () => {
    const points = grid(300);
    const plan = planMarkers(points, 7, view);
    expect(plan.clusters.length).toBeGreaterThan(0);
    const all = [...plan.single, ...plan.clusters.flatMap((c) => c.ids)];
    expect(all.length).toBe(300);
    expect(new Set(all).size).toBe(300);
  });
  it("leaves kept (selected) ids as singles and drops points far outside the view", () => {
    const points = [...grid(300), { id: "far", lat: 35, lng: 129 }];
    const plan = planMarkers(points, 7, view, new Set(["p3"]));
    expect(plan.single.has("p3")).toBe(true);
    expect(plan.single.has("far")).toBe(false);
    expect(plan.clusters.some((c) => c.ids.includes("far"))).toBe(false);
  });
});
