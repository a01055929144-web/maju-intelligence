import { expect, test } from "@playwright/test";

const order = (id: string, customerName: string, revision = 1) => ({
  id, customerName, deliveryDate: "2026-11-12", status: "submitted", knownTotal: 1234567, hasMarketPrice: true,
  requestMemo: "뒷문 냉장고 옆에 놓아 주세요. 오전 10시 전 도착 부탁드립니다.", submittedAt: "2026-11-10T01:00:00Z", revision,
  lines: [{ name: "합성 대용량 냉동 감자튀김 슈스트링", spec: "2.5kg×4입", unit: "박스", quantity: 3, total: 98000, marketPrice: false },
    { name: "합성 시세 채소", spec: "", unit: "kg", quantity: 5, total: null, marketPrice: true }],
});

for (const width of [1440, 390]) test(`order inbox confirms new orders and reports conflicts at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const confirmed = new Set<string>();
  await page.route("**/api/orders*", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ action: "confirm", revision: 1 });
      if (body.orderId === "o2") return route.fulfill({ status: 409, json: { message: "점주가 방금 수정했거나 이미 처리된 주문입니다. 새로고침 후 다시 확인해 주세요." } });
      confirmed.add(body.orderId);
      return route.fulfill({ json: { order: { id: body.orderId, status: "received", revision: 2 } } });
    }
    const items = [order("o1", "합성 송파 시험 매장"), order("o2", "합성 잠실 매장")].filter((item) => !confirmed.has(item.id));
    return route.fulfill({ json: { items, hasMore: false } });
  });

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "주문 확인" })).toBeVisible();
  await expect(page.getByText("합성 송파 시험 매장")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const confirmButtons = page.getByRole("button", { name: "확인", exact: true });
  // 누르기 쉬운 크기(44px) 기준은 모바일 화면 규칙이다(AGENTS.md 0-0-1).
  if (width === 390) expect((await confirmButtons.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await confirmButtons.first().click();
  await expect(page.getByRole("status")).toContainText("합성 송파 시험 매장 주문을 확인했습니다.");
  await expect(page.getByText("합성 송파 시험 매장", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "확인", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("점주가 방금 수정했거나");
});

test("order inbox shows an empty state with the next step", async ({ page }) => {
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/orders*", (route) => route.fulfill({ json: { items: [], hasMore: false } }));
  await page.goto("/orders");
  await expect(page.getByText("확인할 새 주문이 없습니다.")).toBeVisible();
});

test("order inbox shows a retry action when loading fails", async ({ page }) => {
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/orders*", (route) => route.fulfill({ status: 500, json: { message: "주문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } }));
  await page.goto("/orders");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
});
