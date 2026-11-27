import { expect, test } from "@playwright/test";

const order = (id: string, customerName: string, revision = 1) => ({
  id, customerName, deliveryAddress: "서울 송파구 합성로 1 101호", orderedBy: "합성 점주 · 점주",
  deliveryDate: "2026-11-12", status: "submitted", knownTotal: 1234567, hasMarketPrice: true,
  supplyAmount: 1122334, taxAmount: 112233, loadingPosition: "뒷문 냉장고 옆", recipientPhoneLast4: "5678", deliveryPasswordSet: true,
  requestMemo: "뒷문 냉장고 옆에 놓아 주세요. 오전 10시 전 도착 부탁드립니다.", submittedAt: "2026-11-10T01:00:00Z", updatedAt: "2026-11-10T01:00:00Z", revision,
  lines: [{ name: "합성 대용량 냉동 감자튀김 슈스트링", spec: "2.5kg×4입", unit: "박스", quantity: 3, unitPrice: 30000, supply: 89091, tax: 8909, total: 98000, marketPrice: false, promotion: true },
    { name: "합성 시세 채소", spec: "", unit: "kg", quantity: 5, unitPrice: null, supply: null, tax: null, total: null, marketPrice: true, promotion: false }],
});
const login = async (page: import("@playwright/test").Page) =>
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();

for (const width of [1440, 390]) test(`order inbox filters, expands and confirms orders at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  const confirmed = new Set<string>();
  const requests: URL[] = [];
  await page.route("**/api/orders/fulfillment", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.orderIds).toEqual(["o1"]);
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    return route.fulfill({ json: { items: [{ orderId: "o1", status: "in_delivery", revision: 3 }] } });
  });
  await page.route("**/api/orders*", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({ action: "confirm", revision: 1 });
      if (body.orderId === "o2") return route.fulfill({ status: 409, json: { message: "점주가 방금 수정했거나 이미 처리된 주문입니다. 새로고침 후 다시 확인해 주세요." } });
      confirmed.add(body.orderId);
      return route.fulfill({ json: { order: { id: body.orderId, status: "received", revision: 2 } } });
    }
    const url = new URL(route.request().url());
    requests.push(url);
    const items = [order("o1", "합성 송파 시험 매장"), order("o2", "합성 잠실 매장")]
      .map((item) => confirmed.has(item.id) ? { ...item, status: "received", revision: 2 } : item)
      .filter((item) => !url.searchParams.get("q") || item.customerName.includes(url.searchParams.get("q")!));
    const status = url.searchParams.get("status");
    return route.fulfill({ json: { items: status === "all" ? items : items.filter((item) => item.status === status), statusCounts: { submitted: 2, received: 0 }, hasMore: false } });
  });

  await page.goto("/orders", { timeout: 60_000 });
  // 앱 화면틀(상단 줄·메뉴) 안에서 열린다.
  await expect(page.getByRole("heading", { name: "주문 관리", exact: true })).toBeVisible();
  await expect(page.getByText("MAJU", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("합성 송파 시험 매장", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.getByLabel("보기").locator("option")).toHaveText(["50개", "100개", "300개", "500개"]);
  await page.getByLabel("줄 선택").first().check();
  await expect(page.getByRole("button", { name: "선택 엑셀 · 전체 열" })).toBeVisible();
  await page.getByRole("button", { name: "선택 해제" }).click();

  await page.getByText("2개 품목 · 배송지·주문자").first().click();
  await expect(page.getByText("서울 송파구 합성로 1 101호").first()).toBeVisible();
  await expect(page.getByText("합성 점주 · 점주").first()).toBeVisible();
  expect(requests[0].searchParams.get("status")).toBe("all");
  expect(requests[0].searchParams.get("dateField")).toBe("submitted");
  expect(requests[0].searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  await page.getByRole("button", { name: "합성 송파 시험 매장" }).click();
  await expect(page.getByRole("dialog", { name: "합성 송파 시험 매장 주문 상세" })).toBeVisible();
  await expect(page.getByText("끝 4자리 5678")).toBeVisible();
  await expect(page.getByText("행사", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();

  await page.locator('input[aria-label="매장 이름 검색"]:visible').fill("잠실");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("button", { name: "합성 송파 시험 매장" })).toHaveCount(0);
  expect(requests.at(-1)!.searchParams.get("q")).toBe("잠실");
  await page.locator('input[aria-label="매장 이름 검색"]:visible').fill("");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  // 검색을 비운 뒤 전체 목록이 다시 올 때까지 기다린다(안 기다리면 필터된 잠실 줄의 "확인"을 눌러 간헐적으로 실패했다).
  await expect(page.getByText("합성 송파 시험 매장", { exact: true }).first()).toBeVisible();

  const confirmButtons = page.getByRole("button", { name: "확인", exact: true });
  // 누르기 쉬운 크기(44px) 기준은 모바일 화면 규칙이다(AGENTS.md 0-0-1).
  if (width === 390) expect((await confirmButtons.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await confirmButtons.first().click();
  await expect(page.getByText("합성 송파 시험 매장 주문을 확인했습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "합성 송파 시험 매장" })).toBeVisible();
  await expect(page.getByText("확인됨", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "합성 송파 시험 매장" }).click();
  await page.getByRole("button", { name: "배송 출발" }).click();
  await expect(page.getByText("합성 송파 시험 매장 주문이 배송 중으로 바뀌었습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("배송 중");
  await expect(page.getByText("배송 완료는 기사 화면에서 코스·증빙과 함께 처리합니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).first().click();
  await expect(page.getByText(/점주가 방금 수정했거나/)).toBeVisible();

  await page.getByRole("tab", { name: "배송 완료" }).click();
  expect(requests.at(-1)!.searchParams.get("status")).toBe("delivered");
  await expect(page.getByText("이 상태의 주문이 없습니다.")).toBeVisible();
});

test("order inbox shows an empty state with the next step", async ({ page }) => {
  await login(page);
  await page.route("**/api/orders*", (route) => route.fulfill({ json: { items: [], hasMore: false } }));
  await page.goto("/orders");
  await expect(page.getByText("최근 30일 주문이 없습니다.")).toBeVisible();
});

test("order inbox shows a retry action when loading fails", async ({ page }) => {
  await login(page);
  await page.route("**/api/orders*", (route) => route.fulfill({ status: 500, json: { message: "주문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } }));
  await page.goto("/orders");
  await expect(
    page.getByRole("alert").filter({ hasText: "주문을 불러오지 못했습니다." }).getByRole("button", { name: "다시 시도" }),
  ).toBeVisible();
});

test("CX-62 retries a failed receipt without treating an unlinked order as received", async ({ page }) => {
  await login(page);
  let attempts = 0;
  await page.route("**/api/orders*", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toMatchObject({ action: "confirm", orderId: "o1", revision: 1 });
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 409, json: {
        code: "order_document_failed", message: "전표 연결에 실패했습니다. 주문을 접수하지 않았습니다.",
      } });
      return route.fulfill({ json: { order: { id: "o1", status: "received", revision: 2 } } });
    }
    return route.fulfill({ json: { hasMore: false, items: attempts > 1 ? [] : [{
      ...order("o1", "합성 전표 매장"), draftReceipt: true, orderDocument: { status: "unlinked" },
    }] } });
  });
  await page.goto("/orders");
  await expect(page.getByText("접수 시 전표 연결", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText("전표 연결 실패", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전표 연결 다시 시도" }).click();
  await expect(page.getByText("합성 전표 매장 주문을 확인했습니다.", { exact: true })).toBeVisible();
});
