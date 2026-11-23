import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const items = [
  { orderId: "00000000-0000-4000-8000-000000000101", customerName: "합성 동부 식당", deliveryDate: "2026-11-18", territory: "동부", vehicle: "1호차", requestMemo: "파손 주의", productId: "p1", productName: "양파", specification: "15kg", unit: "망", quantity: 3, marketPrice: false, trackingEnabled: true, supplierNames: [], mode: "inventory", supplier: "매입처 미등록" },
  { orderId: "00000000-0000-4000-8000-000000000102", customerName: "합성 서부 식당", deliveryDate: "2026-11-18", territory: "서부", vehicle: "2호차", requestMemo: "", productId: "p2", productName: "꽃게", specification: "대", unit: "kg", quantity: 5, marketPrice: true, trackingEnabled: false, supplierNames: ["합성 수산"], mode: "market", supplier: "합성 수산" },
];

for (const width of [1440, 390]) test(`CX-66 dispatch button handles API failure and success without overflow at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 390 ? 900 : 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  let postCount = 0;
  let dispatched = false;
  await page.route("**/api/orders/fulfillment*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { items: dispatched ? [] : items } });
    postCount += 1;
    const body = route.request().postDataJSON() as { companyId: string; orderIds: string[]; idempotencyKey: string };
    expect(body.companyId).toBe(companyId);
    expect(body.orderIds).toEqual(items.map((item) => item.orderId));
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    if (postCount === 1) return route.fulfill({ status: 409, json: { message: "합성 재고 부족으로 출고하지 못했습니다." } });
    dispatched = true;
    return route.fulfill({ json: { orders: body.orderIds.map((orderId) => ({ orderId, status: "in_delivery" })) } });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto(`/orders/fulfillment?companyId=${companyId}`);
  await expect(page.getByRole("heading", { name: "출고 준비" })).toBeVisible();
  await expect(page.getByText("양파 15kg", { exact: true })).toBeVisible();
  const dispatch = page.getByRole("button", { name: "출고 확정", exact: true });
  await expect(dispatch).toBeEnabled();
  await dispatch.click();
  await expect(page.getByRole("alert").filter({ hasText: "합성 재고 부족" })).toBeVisible();
  await dispatch.click();
  await expect(page.getByText("이 배송일에 접수 완료된 주문이 없습니다.")).toBeVisible();
  expect(postCount).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`CX-66-dispatch-${width}.png`), fullPage: true });
});
