import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MobileDriverRouteWorkspace } from "../components/mobile-driver-route-workspace";

it("기사 화면은 지도 위 진행 카드와 3개 하단 메뉴를 사용한다", () => {
  const html = renderToStaticMarkup(
    <MobileDriverRouteWorkspace
      driverName="김기사"
      selectedStopId="customer-2"
      stops={[
        { address: "서울 중구 1", completed: true, id: "customer-1", name: "첫 매장", order: 1, region: "중구" },
        { address: "서울 중구 2", completed: false, id: "customer-2", name: "둘째 매장", order: 2, point: { lat: 37.5, lng: 127.1 }, region: "중구" }
      ]}
      vehicleLabel="2호차"
    >
      <p>현재 배송 카드</p>
    </MobileDriverRouteWorkspace>
  );
  expect(html).toContain("운행 중 · 2호차");
  expect(html).toContain("2/2 · 목록");
  expect(html).toContain("1곳 완료");
  expect(html).toContain("지금 할 일");
  expect(html).toContain("현재 배송 카드");
  expect(html).toContain('aria-label="기사 하단 메뉴"');
  expect(html).toContain("오늘 코스");
  expect(html).toContain("배송 기록");
  expect(html).toContain("더보기");
});
