import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StopPhotoList } from "../components/map/stop-photo-list";

it("정류장 사진: 배송 날짜별 제목, 주문이 여럿이면 주문 구분, 사진은 새 탭 링크", () => {
  const html = renderToStaticMarkup(<StopPhotoList groups={[
    { stopId: "s1", routeDate: "2026-11-10", orders: [{ orderId: "o1", photos: [{ id: "a", stopId: "s1", orderId: "o1", sortOrder: 1, url: "https://example.test/a" }] }, { orderId: null, photos: [{ id: "b", stopId: "s1", orderId: null, sortOrder: 2, url: "https://example.test/b" }] }] },
    { stopId: "s2", routeDate: "2026-11-08", orders: [{ orderId: "o9", photos: [{ id: "c", stopId: "s2", orderId: "o9", sortOrder: 1, url: "https://example.test/c" }] }] }
  ]} />);
  expect(html).toContain("2026-11-10 배송");
  expect(html).toContain("주문 1");
  expect(html).toContain("주문 연결 없음");
  expect(html).toContain('target="_blank"');
  expect(html.match(/주문 \d/g)?.length).toBe(1);
});
