import { expect, test } from "@playwright/test";

test("CX-66 390px fulfillment summary and A4 print views stay read-only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/orders/fulfillment*", (route) => route.fulfill({ json: { items: [
    { orderId: "o1", customerName: "합성 동부 식당", deliveryDate: "2026-11-18", territory: "동부", vehicle: "1호차", requestMemo: "파손 주의", productId: "p1", productName: "양파", specification: "15kg", unit: "망", quantity: 3, marketPrice: false, trackingEnabled: true, supplierNames: [], mode: "inventory", supplier: "매입처 미등록" },
    { orderId: "o2", customerName: "합성 서부 식당", deliveryDate: "2026-11-18", territory: "서부", vehicle: "2호차", requestMemo: "", productId: "p2", productName: "꽃게", specification: "대", unit: "kg", quantity: 5, marketPrice: true, trackingEnabled: false, supplierNames: ["합성 수산"], mode: "market", supplier: "합성 수산" },
  ] } }));
  await page.goto("/orders/fulfillment");
  await expect(page.getByRole("heading", { name: "출고 준비" })).toBeVisible();
  await expect(page.getByRole("button", { name: "출고 확정 준비 중" })).toBeDisabled();
  await expect(page.getByText("양파 15kg", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("tab", { name: "매입처 발주서" }).click();
  await expect(page.getByRole("combobox", { name: "매입처" })).toHaveValue("합성 수산");
  await expect(page.locator("header").getByText(/합성 수산/)).toBeVisible();
  await expect(page.getByRole("button", { name: "이미지 저장" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF·인쇄" })).toBeVisible();
});
