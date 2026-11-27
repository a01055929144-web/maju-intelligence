import { expect, test, type Page } from "@playwright/test";
import { deliveryDayState, deliveryGuide, kstDateTime, nextDeliveryDate, ORDER_HORIZON_DAYS, type DeliveryPolicy } from "../../domains/order/order-rules";

// CX-145 P1-1: 장바구니 배송일 — 홍곱창 규칙(월~토 배송, D일 23:59까지 주문하면 D+1 배송)을 모바일 390에서 시계를 고정해 확인한다.
const policyBase: DeliveryPolicy = { weekdays: [1, 2, 3, 4, 5, 6], cutoffDaysBefore: 1, cutoffTime: "23:59", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0, holidays: [] };
const productId = "50000000-0000-4000-8000-000000000150";

async function setup(page: Page, at: string, holidays: DeliveryPolicy["holidays"] = []) {
  const now = new Date(`${at}+09:00`);
  const policy = { ...policyBase, holidays };
  const placed: Array<Record<string, unknown>> = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(now);
  const order = { id: "synthetic-order", deliveryDate: "", status: "submitted", knownTotal: 2200, requestMemo: "", marketPricePending: false, submittedAt: now.toISOString(), revision: 1, authorLabel: "합성 점주 · 점주",
    lines: [{ product_id: productId, promotion_id: null, product_name: "합성 양파", quantity: 1, sales_unit: "봉", specification: "", tax_type: "exempt", unit_price: 2200, total_amount: 2200 }] };
  await page.route("**/api/storefront", route => {
    const input = route.request().postDataJSON();
    if (route.request().method() === "PUT") {
      placed.push(input);
      expect(deliveryDayState(String(input.deliveryDate), policy, now).ok).toBe(true);
      order.deliveryDate = String(input.deliveryDate);
      return route.fulfill({ json: { id: order.id } });
    }
    const next = nextDeliveryDate(policy, now)!;
    const selected = typeof input.deliveryDate === "string" ? input.deliveryDate : next;
    return route.fulfill({ json: { store: { title: "합성 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true,
      canOrder: deliveryDayState(selected, policy, now).ok, nextDeliveryDate: next, selectedDeliveryDate: selected,
      // 서버가 계산해 내려주는 날짜 상태·안내(화면은 계산하지 않는다)
      deliveryGuide: deliveryGuide(policy, now).text,
      deliveryDays: Array.from({ length: ORDER_HORIZON_DAYS + 1 }, (_, offset) => {
        const date = new Date(Date.parse(`${kstDateTime(now).date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
        const state = deliveryDayState(date, policy, now);
        return state.ok ? { date, ok: true } : { date, ok: false, reason: state.reason };
      }), notice: "", marketPriceNotice: "", policy,
      lines: [{ key: `${productId}:`, productId, promotionId: null, name: "합성 양파", category: "농산", brand: "", spec: "", unit: "봉", badge: "", taxType: "exempt", unitPrice: 2200, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
      orders: placed.length ? [order] : [], preferences: [], historyPage: 1, historyHasMore: false } });
  });
  await page.goto("/store?view=order#synthetic-delivery");
  return { placed };
}

test("CX-145 P1-1 22시대 주문 → 내일(11/26 목) 배송이 기본, 금액이 보이고 주문 성공", async ({ page }) => {
  const { placed } = await setup(page, "2026-11-25T22:29:00");
  await expect(page.getByTestId("delivery-guide")).toHaveText("오늘 주문하면 내일 배송 (밤 11:59 마감)");
  await expect(page.getByTestId("delivery-date")).toHaveText("11/26(목)");
  await page.getByRole("button", { name: "합성 양파 수량 늘리기" }).click();
  await expect(page.getByTestId("cart-line-amount")).toHaveText("2,200원 × 1 = 2,200원");
  await expect(page.getByTestId("cart-summary")).toContainText("2,200원");
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  expect(placed).toHaveLength(1);
  expect(placed[0].deliveryDate).toBe("2026-11-26");
});

test("CX-145 P1-1 자정 이후(11/26 00:10)는 마감이 다시 열려 11/27 배송", async ({ page }) => {
  await setup(page, "2026-11-26T00:10:00");
  await expect(page.getByTestId("delivery-guide")).toHaveText("오늘 주문하면 내일 배송 (밤 11:59 마감)");
  await expect(page.getByTestId("delivery-date")).toHaveText("11/27(금)");
});

test("CX-145 P1-1 토요일 밤은 일요일 배송 없음 → 월요일, 마감 후 문구", async ({ page }) => {
  await setup(page, "2026-11-28T22:00:00");
  await expect(page.getByTestId("delivery-guide")).toHaveText("오늘 주문하면 모레 배송 (11/29(일) 밤 11:59 마감)");
  await expect(page.getByTestId("delivery-date")).toHaveText("11/30(월)");
  await expect(page.locator('[data-day="2026-11-29"]')).toBeDisabled();
});

test("CX-145 P1-1 휴무일·마감 지난 날·배송 없는 날은 고를 수 없고 이유가 보이며, 달력으로 다른 날짜를 골라 주문", async ({ page }) => {
  const { placed } = await setup(page, "2026-11-25T22:29:00", [{ kind: "date", date: "2026-11-27" }]);
  await expect(page.getByTestId("delivery-date")).toHaveText("11/26(목)");
  const cell = (day: string) => page.locator(`[data-day="${day}"]`);
  await expect(cell("2026-11-25")).toBeDisabled(); await expect(cell("2026-11-25")).toContainText("마감");
  await expect(cell("2026-11-27")).toBeDisabled(); await expect(cell("2026-11-27")).toContainText("휴무");
  await expect(cell("2026-11-29")).toBeDisabled(); await expect(cell("2026-11-29")).toContainText("배송 없음");
  expect((await cell("2026-11-28").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await cell("2026-11-28").click();
  await expect(page.getByTestId("delivery-date")).toHaveText("11/28(토)");
  await page.getByRole("button", { name: "합성 양파 수량 늘리기" }).click();
  await page.getByRole("button", { name: "후결제로 주문 신청", exact: true }).click();
  await expect(page.getByRole("heading", { name: "주문 내역", exact: true })).toBeVisible();
  expect(placed).toHaveLength(1);
  expect(placed[0].deliveryDate).toBe("2026-11-28");
});

test("CX-145 P1-1 버튼이 꺼질 때는 이유를 한 줄로 보여 준다", async ({ page }) => {
  await setup(page, "2026-11-25T22:29:00");
  await expect(page.getByTestId("submit-disabled-reason")).toHaveText("품목을 담아 주세요.");
  await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
});
