import { expect, it } from "vitest";
import { groupStopPhotos } from "./stop-photo-groups";

const p = (id: string, stopId: string, orderId: string | null, sortOrder: number) => ({ id, stopId, orderId, sortOrder, url: `https://example.test/${id}` });

it("최근 5회 배송만, 날짜 내림차순, 사진 없는 배송은 빠진다", () => {
  const stops = ["01", "02", "03", "04", "05", "06", "07"].map((d) => ({ id: `s${d}`, routeDate: `2026-11-${d}` }));
  const groups = groupStopPhotos(stops, stops.map((s) => p(`p${s.id}`, s.id, null, 1)).filter((x) => x.stopId !== "s06"));
  expect(groups.map((g) => g.routeDate)).toEqual(["2026-11-07", "2026-11-05", "2026-11-04", "2026-11-03"]);
});
it("같은 배송의 사진은 주문별로 나뉘고 사진 순서를 지킨다", () => {
  const [g] = groupStopPhotos([{ id: "s1", routeDate: "2026-11-10" }], [p("b", "s1", "o2", 2), p("a", "s1", "o1", 1), p("c", "s1", "o2", 3), p("d", "s1", null, 4)]);
  expect(g.orders.map((o) => [o.orderId, o.photos.map((x) => x.id)])).toEqual([["o1", ["a"]], ["o2", ["b", "c"]], [null, ["d"]]]);
});
it("사진이 하나도 없으면 빈 목록(이전 방식으로 돌아가는 신호)", () => {
  expect(groupStopPhotos([{ id: "s1", routeDate: "2026-11-10" }], [])).toEqual([]);
});
