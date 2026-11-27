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
      return route.fulfill({ json: { result: { id: order.id } } });
    }
    const next = nextDeliveryDate(policy, now)!;
    const selected = typeof input.deliveryDate === "string" ? input.deliveryDate : next;
    return route.fulfill({ json: { mobileOrderPages: true, store: { title: "합성 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true,
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


for (const width of [1440, 390]) test('P1-6 merged guide to saved delivery at '+width+'px', async ({page}, info) => {
 const {placed}=await setup(page,'2026-11-25T22:29:00');
 await page.setViewportSize({width,height:900});
 const overflow=async()=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3)).toBe(true);
 if(width===390){
  await page.getByRole('button',{name:'합성 양파 수량 늘리기'}).click();
  await page.getByRole('button',{name:/장바구니 1품목/}).click();
  await page.getByRole('button',{name:'주문 확인으로'}).click();
 }
 await expect(page.getByTestId('delivery-guide')).toHaveText('오늘 주문하면 내일 배송 (밤 11:59 마감)');
 await page.locator('[data-day="2026-11-28"]').click();
 await expect(page.locator('[data-day="2026-11-28"]')).toHaveAttribute('aria-pressed','true');
 await overflow();
 await page.screenshot({path:info.outputPath('p16-confirm-'+width+'.png'),fullPage:true});
 if(width===1440) await page.getByRole('button',{name:'합성 양파 수량 늘리기'}).click();
 await page.getByRole('button',{name:width===390?'주문 접수':'후결제로 주문 신청',exact:true}).click();
 expect(placed).toHaveLength(1);expect(placed[0].deliveryDate).toBe('2026-11-28');
 if(width===390){
  await expect(page.getByRole('region',{name:'접수 완료'})).toContainText('2026-11-28');
  await page.getByRole('button',{name:'배송 현황 보기',exact:true}).click();
 }else{
  await page.getByRole('link',{name:'주문 내역',exact:true}).click();
  await page.getByRole('button',{name:'배송 현황',exact:true}).click();
 }
 await expect(page.getByRole('region',{name:'배송 확인'})).toContainText('배송일 2026-11-28');
 await expect(page.getByRole('region',{name:'배송 확인'})).toContainText('synthetic-order');
 await overflow();await page.screenshot({path:info.outputPath('p16-saved-delivery-'+width+'.png'),fullPage:true});
});
