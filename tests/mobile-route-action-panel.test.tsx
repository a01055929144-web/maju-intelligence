import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MobileRouteActionPanel } from "../components/mobile-route-action-panel";

it("기사 길 안내는 CC-54 카카오내비 동작을 누르는 버튼으로 노출한다", () => {
  const html = renderToStaticMarkup(
    <MobileRouteActionPanel
      address="서울 중구 배송로 1"
      customerId="customer-1"
      customerName="가짜식당"
      point={{ lat: 37.5, lng: 127.1 }}
    />
  );
  expect(html).toContain("카카오내비 길 안내");
  expect(html).toContain('type="button"');
  expect(html).not.toContain("map.kakao.com/link/search");
});
