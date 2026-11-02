import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`staff document acceptance retry and review at ${width}px`, async ({ browser }, info) => {
  const company = "00000000-0000-4000-8000-000000000001", sheet = "10000000-0000-4000-8000-000000000001", quote = "10000000-0000-4000-8000-000000000002";
  const customer = "20000000-0000-4000-8000-000000000001";
  const context = await browser.newContext({ baseURL: String(info.project.use.baseURL), viewport: { width, height: 900 } });
  const attempts: Array<{ idempotencyKey: string; documentVersionId: string; customerId: string | null; customerProfile?: { businessName: string } }> = [];
  let issued = 0;
  try {
    expect((await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    await context.route("**/api/pricing-documents*", route => {
      const url = new URL(route.request().url());
      const result = url.searchParams.get("action") === "list" ? { items: [{ id: sheet, content: { title: "합성 단가표" } }, { id: quote, content: { title: "합성 견적" } }], total: 2 }
        : [{ id: url.searchParams.get("id"), version: 1, content: { title: "합성 게시본" }, publishedAt: "2026-11-02T01:00:00Z" }];
      return route.fulfill({ json: { result, manager: true } });
    });
    await context.route("**/api/pricing-store-links*", route => {
      if (route.request().method() === "POST") issued++;
      return route.fulfill({ json: { items: [], hasMore: false } });
    });
    await context.route("**/api/pricing-order-settings*", route => route.fulfill({ json: { customers: [{ id: customer, customer_name: "합成 매장" }] } }));
    await context.route("**/api/pricing-document-acceptance*", route => {
      if (route.request().method() === "GET") {
        const id = new URL(route.request().url()).searchParams.get("documentId");
        return route.fulfill({ json: { result: id ? [{ id, version: 1, content: { title: "합성 게시본" }, publishedAt: "2026-11-02T01:00:00Z" }]
          : { items: [{ id: sheet, content: { title: "합성 단가표" } }, { id: quote, content: { title: "다른 직원의 합성 견적" } }] } } });
      }
      attempts.push(route.request().postDataJSON());
      return route.fulfill({ status: attempts.length === 1 ? 503 : 200, json: { message: attempts.length === 1 ? "수락을 처리하지 못했습니다. 다시 시도해 주세요."
        : attempts.length === 2 ? "연결 확인이 필요해 주문 링크를 발급하지 않았습니다." : "견적과 협의 단가를 수락 처리했습니다." } });
    });
    const page = await context.newPage();
    await page.goto(`/revenue/pricing/links?companyId=${company}`);
    await page.getByLabel(/^문서 선택/).selectOption(sheet);
    await page.getByLabel(/^발행 버전/).selectOption(sheet);
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByLabel("링크를 받을 매장").selectOption(customer);
    const accept = page.getByRole("button", { name: "직원 대신 수락", exact: true });
    if (width === 390) expect((await accept.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await accept.click();
    await expect(page.getByRole("status")).toContainText("다시 시도");
    await accept.click();
    await expect(page.getByRole("status")).toContainText("연결 확인");
    expect(attempts[0].idempotencyKey).toBe(attempts[1].idempotencyKey);
    expect(issued).toBe(0);
    await page.getByLabel(/^문서 선택/).selectOption(quote);
    await page.getByLabel(/^발행 버전/).selectOption(quote);
    await accept.click();
    await expect(page.getByRole("status")).toContainText("견적과 협의 단가");
    expect(attempts[2].idempotencyKey).not.toBe(attempts[1].idempotencyKey);
    expect(issued).toBe(0);
    await page.getByRole("checkbox", { name: "기존 거래처 없이 매장·리드 수락" }).check();
    await page.getByLabel("매장 이름", { exact: true }).fill("신규 합성 매장");
    await page.getByLabel("매장 연락처", { exact: true }).fill("010-1234-5678");
    await page.getByLabel("매장 주소", { exact: true }).fill("합성 주소");
    await accept.click();
    await expect.poll(() => attempts.length).toBe(4);
    expect(attempts[3].customerId).toBeNull();
    expect(attempts[3].customerProfile?.businessName).toBe("신규 합성 매장");
    await page.screenshot({ path: info.outputPath(`acceptance-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBeTruthy();
  } finally { await context.close(); }
});
