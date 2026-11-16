import { expect, test, type Page } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";

async function loginCustomer(page: Page) {
  const response = await page.request.post("/api/customer/login", { data: {
    email: "ci-owner@example.test", password: "ci-owner-layout-password-2026",
  } });
  expect(response.ok()).toBeTruthy();
}

test("390px driver map supports slide, keyboard and route-sales outcomes", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.clear());
  await loginCustomer(page);
  const writes: Array<Record<string, unknown>> = [];
  await page.route("**/api/mobile/driver-sales-stops", async route => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, status: "saved" } });
    }
    return route.fulfill({ json: { stops: [
      { id: "10000000-0000-4000-8000-000000000001", leadId: "lead-1", order: 1, status: "planned", name: "합성 영업 매장", address: "서울 합성로 1" },
      { id: "10000000-0000-4000-8000-000000000002", leadId: "lead-2", order: 2, status: "planned", name: "합성 미전달 매장", address: "서울 합성로 2" },
    ] } });
  });

  await page.goto("/mobile/today");
  await expect(page.getByTestId("driver-route-workspace")).toBeVisible();
  const startTrack = page.getByText("밀어서 운행 시작 →", { exact: true }).locator("..");
  const trackBox = await startTrack.boundingBox();
  const handleBox = await startTrack.locator(":scope > div").boundingBox();
  expect(trackBox).not.toBeNull(); expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(trackBox!.x + trackBox!.width - 10, handleBox!.y + handleBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "밀어서 운행 종료" })).toBeAttached();
  await page.getByRole("button", { name: "밀어서 운행 종료" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "밀어서 운행 시작" })).toBeAttached();

  const sales = page.getByRole("region", { name: "가는 길 영업" });
  await expect(sales.getByText("합성 영업 매장", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("cx56-driver-map-390.png") });
  await sales.getByLabel("사장님께 직접 드림").first().check();
  await sales.getByRole("button", { name: "밀어서 단가표 완료" }).first().press("Enter");
  await expect.poll(() => writes[0]).toMatchObject({ outcome: "completed", handedToOwner: true });
  await sales.getByText("전달 못 함", { exact: true }).click();
  await sales.getByRole("button", { name: "문이 닫혀 있음" }).click();
  await expect.poll(() => writes[1]).toMatchObject({ outcome: "closed", handedToOwner: false });
  await expect(page.getByText("전달 못 함 사유를 기록했습니다.")).toBeVisible();
  await page.screenshot({ path: info.outputPath("cx56-route-sales-390.png") });
});

test("1440px store order table totals fixed prices, excludes market prices and hides columns", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const product = { key: "fixed", productId: "fixed", promotionId: null, name: "합성 미림", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null };
  await page.route("**/api/storefront", route => route.fulfill({ json: {
    store: { title: "합성 PC 주문", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 1, validUntil: "2099-12-31", priceAvailable: true, canOrder: true, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0, 1, 2, 3, 4, 5, 6] }, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [product, { ...product, key: "market", productId: "market", name: "합성 시가 품목", unitPrice: null, isMarketPrice: true }] },
    orders: [], preferences: [], historyPage: 1, historyHasMore: false,
  } }));
  await page.goto("/store?view=order#cx56-order");
  const table = page.getByRole("table");
  await table.getByRole("textbox", { name: "합성 미림 수량" }).fill("2");
  await table.getByRole("textbox", { name: "합성 시가 품목 수량" }).fill("1");
  await expect(table.locator("tfoot")).toContainText("2,000원");
  await expect(table.locator("tfoot")).toContainText("표 합계에서 시가 1줄 제외");
  await page.getByRole("button", { name: "열 편집" }).click();
  await page.getByText("유통사", { exact: true }).locator("..").getByRole("checkbox").uncheck();
  await expect(table.getByRole("columnheader", { name: /유통사/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("cx56-store-order-table-1440.png") });
});

test("store information update is followed by a company notification", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let information = { businessRegistrationNumber: "0000000000", canEdit: true, phone: "02-000-0000", representativeName: "합성 점주", storeName: "합성 이전 매장", profileSettingsEnabled: true, baseAddress: "서울 합성로 1", addressDetail: "1층", accessNote: "정문", deliveryContactPhone: "010-0000-0000", preferredDeliveryTime: "오전" };
  let changed = false;
  await page.route("**/api/store/information?**", async route => {
    if (route.request().method() === "PATCH") {
      information = { ...information, ...route.request().postDataJSON() };
      changed = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: information });
  });
  await page.route("**/api/store/address?**", route => route.fulfill({ json: { address: "서울 합성로 1 1층", baseAddress: "서울 합성로 1", addressDetail: "1층" } }));
  await page.goto("/store?fixture=s1-single&view=info");
  await page.getByRole("button", { name: "정보 수정" }).click();
  await page.getByLabel("상호").fill("합성 변경 매장");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("매장 정보를 저장했습니다.")).toBeVisible();
  expect(changed).toBe(true);
  await page.screenshot({ path: info.outputPath("cx56-store-information-1440.png") });

  await loginCustomer(page);
  await page.route("**/api/customer/store-notifications", route => route.fulfill({ json: { items: [{
    id: "notification-1", notificationType: "store_profile_changed", subject: "합성 변경 매장", createdAt: "2026-11-17T00:00:00Z", readAt: null, processedAt: null,
    beforeValues: { storeName: "합성 이전 매장" }, afterValues: { storeName: information.storeName },
  }] } }));
  await page.goto("/dashboard/settings/store-notifications");
  await expect(page.getByText("매장 정보 바뀜 · 합성 변경 매장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전후 비교 보기 (1칸)" }).click();
  await expect(page.getByRole("cell", { name: "합성 이전 매장" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "합성 변경 매장" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("cx56-store-notification-1440.png") });
});
