import { expect, it } from "vitest";
import { groupStopsByDriver, stopClock, type RouteStopRecord } from "./stop-timeline";

const s = (id: string, order: number, driverName: string, type: "delivery" | "sales" = "delivery"): RouteStopRecord => ({ id, order, type, status: "planned", name: `가짜${id}`, driverName, photoCount: 0 });

it("기사별로 묶고 순서대로, 영업 정류장은 점선", () => {
  const groups = groupStopsByDriver([s("c", 3, "갑"), s("a", 1, "갑"), s("x", 1, "을"), s("b", 2, "갑", "sales")]);
  expect(groups.map((g) => g.driverName)).toEqual(["갑", "을"]);
  expect(groups[0].stops.map((x) => [x.id, x.dashed])).toEqual([["a", false], ["b", true], ["c", false]]);
});
it("정류장이 없으면 빈 목록", () => expect(groupStopsByDriver([])).toEqual([]));
it("시각은 한국 시간 HH:mm, 없거나 잘못되면 빈 글", () => {
  expect(stopClock("2026-11-16T05:30:00Z")).toBe("14:30");
  expect(stopClock(null)).toBe("");
  expect(stopClock("잘못")).toBe("");
});
