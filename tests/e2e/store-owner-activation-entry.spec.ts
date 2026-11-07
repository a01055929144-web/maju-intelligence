import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`representative creates and copies a store owner link at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width, height: width === 390 ? 844 : 900 } });
    const login = await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
    expect(login.ok()).toBeTruthy();
    const page = await context.newPage();
    let activationAttempts = 0;

    await page.route("**/api/customer/me", (route) => route.fulfill({ json: {
      companyName: "CI 화면 점검 회사",
      features: { pricing: false, storeOrdering: false },
      session: { companyId: "10000000-0000-4000-8000-000000000001", companyMemberId: "40000000-0000-4000-8000-000000000001", companyName: "CI 화면 점검 회사", name: "CI 대표", workspaceRole: "owner" }
    } }));
    await page.route("**/api/store/accounts/provision", async (route) => {
      const customerId = String((route.request().postDataJSON() as { customerId?: string })?.customerId || "");
      if (!customerId) return route.fulfill({ status: 403, json: { message: "Forbidden" } });
      activationAttempts += 1;
      if (activationAttempts > 1) return route.fulfill({ status: 403, json: { message: "Forbidden" } });
      return route.fulfill({ json: { activationUrl: "https://store.example.test/store/activate#test-token", expiresAt: "2026-11-07T04:00:00.000Z" } });
    });
    await page.route("**/api/customers*", (route) => route.fulfill({ json: { source: "supabase", customers: [{
      id: "20000000-0000-4000-8000-000000000001", address: "서울시 중구", businessNumber: "1234567890", businessStatus: "정상",
      customerName: "점주 개통 테스트 매장", deliveryKm: 0, deliveryManager: "", grade: "C", industry: "", lastOrderDays: 0,
      loadingPosition: "", memoCount: 0, monthlyRevenue: 0, phone: "", region: "서울", representativeName: "", visitCount: 0
    }] } }));

    await page.goto("/crm/timeline?section=ledger", { waitUntil: "domcontentloaded" });
    const create = page.getByRole("button", { name: "매장 점주 개통 링크 만들기" });
    await expect(create).toBeVisible();
    await create.click();
    await expect(page.getByLabel("점주 개통 링크")).toHaveValue("https://store.example.test/store/activate#test-token");
    await expect(page.getByRole("button", { name: "링크 복사" })).toBeVisible();
    await create.click();
    await expect(page.getByRole("alert").filter({ hasText: "대표·관리자 권한과 거래처 회사를 확인하세요" })).toBeVisible();

    if (width === 390) {
      expect((await create.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 3)).toBe(true);
    }
    await context.close();
  });
}

test("store owner activation stays hidden while rollout is OFF", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
  const login = await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  expect(login.ok()).toBeTruthy();
  const page = await context.newPage();
  await page.route("**/api/customer/me", (route) => route.fulfill({ json: {
    companyName: "CI 화면 점검 회사",
    features: { pricing: false, storeOrdering: false },
    session: { companyId: "10000000-0000-4000-8000-000000000001", companyMemberId: "40000000-0000-4000-8000-000000000001", name: "CI 대표", workspaceRole: "owner" }
  } }));
  await page.route("**/api/store/accounts/provision", (route) => route.fulfill({ status: 404, json: { message: "Not found" } }));
  await page.route("**/api/customers*", (route) => route.fulfill({ json: { customers: [], source: "supabase" } }));
  await page.goto("/crm/timeline?section=ledger", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "매장 점주 개통 링크 만들기" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "거래처 등록·가져오기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "기존 가져오기 결과 확인" })).toBeVisible();
  await context.close();
});

test("store owner activation requires a ten-digit business number", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width: 390, height: 844 } });
  const login = await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  expect(login.ok()).toBeTruthy();
  const page = await context.newPage();
  let createCalls = 0;
  await page.route("**/api/customer/me", (route) => route.fulfill({ json: {
    companyName: "CI 화면 점검 회사",
    features: { pricing: false, storeOrdering: false },
    session: { companyId: "10000000-0000-4000-8000-000000000001", companyMemberId: "40000000-0000-4000-8000-000000000001", name: "CI 대표", workspaceRole: "owner" }
  } }));
  await page.route("**/api/store/accounts/provision", (route) => {
    const customerId = String((route.request().postDataJSON() as { customerId?: string })?.customerId || "");
    if (!customerId) return route.fulfill({ status: 403, json: { message: "Forbidden" } });
    createCalls += 1;
    return route.fulfill({ status: 503, json: { message: "Unavailable" } });
  });
  await page.route("**/api/customers*", (route) => route.fulfill({ json: { source: "supabase", customers: [{
    id: "20000000-0000-4000-8000-000000000001", address: "서울시 중구", businessNumber: "123", businessStatus: "확인 필요",
    customerName: "사업자번호 보완 매장", deliveryKm: 0, deliveryManager: "", grade: "C", industry: "", lastOrderDays: 0,
    loadingPosition: "", memoCount: 0, monthlyRevenue: 0, phone: "", region: "서울", representativeName: "", visitCount: 0
  }] } }));
  await page.goto("/crm/timeline?section=ledger", { waitUntil: "domcontentloaded" });
  const blocked = page.getByRole("button", { name: "사업자번호 10자리 등록 후 개통" });
  await expect(blocked).toBeVisible();
  await expect(blocked).toBeDisabled();
  expect(createCalls).toBe(0);
  await context.close();
});
