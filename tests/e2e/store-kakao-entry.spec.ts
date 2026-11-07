import { expect, test, type Page } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const token = "t".repeat(43);
const loginUrl = `/api/auth/kakao/start?store=1&companyId=${companyId}&storeAccountId=${storeAccountId}&activation=1`;

for (const width of [1440, 390]) {
  test(`scoped login and explicit first-owner consent keep activation token out of redirects at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let activation = false, posts = 0;
    await page.route("**/api/storefront", () => { throw new Error("Activation token must not be used for orders"); });
    await page.route("**/api/auth/kakao/start?**", route => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("store")).toBe("1");
      expect(url.searchParams.get("companyId")).toBe(companyId);
      expect(url.searchParams.get("storeAccountId")).toBe(storeAccountId);
      expect(url.searchParams.get("activation")).toBe(activation ? "1" : null);
      expect(url.toString()).not.toContain(token);
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main>합성 카카오 인증 경계</main>" });
    });
    await page.route("**/api/store/accounts/activate", route => {
      posts++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ token, termsAccepted: true });
      return route.fulfill({ json: { loginUrl, termsVersion: "2026-11-07" } });
    });
    await page.goto("/store?fixture=store-kakao-login");
    const login = page.getByRole("button", { name: "카카오로 매장 로그인", exact: true });
    await expect(login).toBeVisible();
    expect((await login.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`store-kakao-login-${width}.png`), fullPage: true });
    await login.click();
    await expect(page.getByText("합성 카카오 인증 경계", { exact: true })).toBeVisible();
    activation = true;
    await page.goto(`/store/activate?fixture=store-owner-activation#${token}`);
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    const start = page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true });
    await expect(start).toBeDisabled();
    expect(posts).toBe(0);
    await expect(page.getByRole("link", { name: "이용약관", exact: true })).toHaveAttribute("href", "/legal/terms");
    await expect(page.getByRole("link", { name: "개인정보처리방침", exact: true })).toHaveAttribute("href", "/legal/privacy");
    const storage = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].join("\n"));
    expect(storage).not.toContain(token);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`store-owner-consent-${width}.png`), fullPage: true });
    await page.getByRole("checkbox").check();
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await start.click();
    await expect(page.getByText("합성 카카오 인증 경계", { exact: true })).toBeVisible();
    expect(posts).toBe(1);
    expect(new URL(page.url()).searchParams.get("activation")).toBe("1");
  });
}

test("invalid, expired and unavailable activation links show recovery guidance", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let status = 410, posts = 0;
  await page.route("**/api/store/accounts/activate", route => { posts++; return route.fulfill({ status, json: { message: "Synthetic activation error" } }); });
  await page.goto("/store/activate?fixture=store-owner-activation#bad");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("전체 링크");
  await expect(page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true })).toBeDisabled();
  expect(posts).toBe(0);
  for (const [code, message] of [[410, "만료"], [404, "준비 중"], [403, "권한"], [400, "약관 동의"], [503, "다시 시도"]] as const) {
    status = code;
    await page.goto(`/store/activate?fixture=store-owner-activation&attempt=${code}#${token}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
    expect(new URL(page.url()).hash).toBe("");
  }
  await page.screenshot({ path: info.outputPath("store-owner-error-390.png"), fullPage: true });
});

test("activation refuses unscoped, token-bearing or external login URLs", async ({ page }) => {
  let target = "";
  await page.route("**/api/store/accounts/activate", route => route.fulfill({ json: { loginUrl: target, termsVersion: "2026-11-07" } }));
  for (const [index, url] of ["https://untrusted.example.test/start", "/api/auth/kakao/start?store=1", `${loginUrl}&token=${token}`].entries()) {
    target = url;
    await page.goto(`/store/activate?fixture=store-owner-activation&attempt=${index}#${token}`);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("로그인 주소");
    expect(new URL(page.url()).pathname).toBe("/store/activate");
  }
});

test("feature OFF keeps scoped login and activation controls disabled with zero auth calls", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/auth/kakao/start**", route => { calls++; return route.abort(); });
  await page.route("**/api/store/accounts/activate", route => { calls++; return route.abort(); });
  await page.goto(`/store?companyId=${companyId.replace("4000", "7000")}&storeAccountId=${storeAccountId.replace("4000", "8000")}`);
  await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toBeDisabled();
  await page.goto(`/store/activate#${token}`);
  await expect(page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("준비 중");
  expect(calls).toBe(0);
});

test("390px can read callback errors without receiving an unscoped login action", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/store?error=store_membership_required");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("권한");
  await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("store-kakao-error-390.png"), fullPage: true });
});


// Synthetic UI contract journey only: no real OAuth, session verification, business lookup or DB writes.
for (const width of [1440, 390]) {
  test(`synthetic CRM link to owner consent, OAuth and cost Excel entry at ${width}px`, async ({ browser }, info) => {
    const origin = "http://127.0.0.1:3100";
    const representative = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
    const owner = await browser.newContext({ baseURL: origin, viewport: { width, height: 900 } });
    try {
      const login = await representative.request.post("/api/customer/login", {
        data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
      });
      expect(login.ok()).toBeTruthy();
      let enabled = true, probes = 0;
      const calls = { provision: 0, consent: 0, start: 0, oauth: 0, callback: 0, costs: 0, imports: 0, orders: 0 };
      const traffic: { url: string; referer: string; body: string; path: string }[] = [];
      for (const context of [representative, owner]) {
        // All non-loopback traffic is denied; the synthetic Kakao route below is fulfilled locally.
        await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.route("**/api/**", route => route.fulfill({ status: 503, json: { message: "Synthetic unavailable" } }));
        context.on("request", request => traffic.push({ url: request.url(), referer: request.headers().referer || "",
          body: request.postData() || "", path: new URL(request.url()).pathname }));
        await context.route(/\/api\/(storefront|store\/orders)(\?|$)/, route => {
          calls.orders++;
          return route.fulfill({ status: 403, json: { message: "Synthetic order boundary" } });
        });
      }
      const activationUrl = `${origin}/store/activate#${token}`;
      const storeUrl = `/store?companyId=${companyId}&storeAccountId=${storeAccountId}`;
      await representative.route("**/api/customer/me", route => route.fulfill({ json: {
        companyName: "CI 화면 점검 회사", features: { pricing: false, storeOrdering: false },
        session: { companyId, companyMemberId: "40000000-0000-4000-8000-000000000001", companyName: "CI 화면 점검 회사", name: "CI 대표", workspaceRole: "owner" }
      } }));
      await representative.route("**/api/customers*", route => route.fulfill({ json: { source: "supabase", customers: [{
        id: "30000000-0000-4000-8000-000000000001", address: "서울시 중구", businessNumber: "1234567890", businessStatus: "정상",
        customerName: "합성 점주 여정 매장", deliveryKm: 0, deliveryManager: "", grade: "C", industry: "", lastOrderDays: 0,
        loadingPosition: "", memoCount: 0, monthlyRevenue: 0, phone: "", region: "서울", representativeName: "", visitCount: 0
      }] } }));
      await representative.route("**/api/store/accounts/provision", route => {
        const body = route.request().postDataJSON();
        expect(Object.keys(body)).toEqual(["customerId"]);
        if (!body.customerId) { probes++; return route.fulfill({ status: enabled ? 403 : 404, json: { message: "Synthetic capability probe" } }); }
        expect(enabled).toBe(true);
        expect(body.customerId).toBe("30000000-0000-4000-8000-000000000001");
        calls.provision++;
        return route.fulfill({ json: { activationUrl, storeUrl: origin + storeUrl, storeAccountId,
          loginUrl: origin + loginUrl.replace("&activation=1", ""), expiresAt: "2026-11-07T04:00:00.000Z" } });
      });
      // Keep issued/callback URLs canonical; only render existing CI fixtures at the document boundary.
      await owner.route(`${origin}/store**`, async route => {
        const url = new URL(route.request().url());
        if (enabled && route.request().isNavigationRequest() && ["/store", "/store/activate"].includes(url.pathname)) {
          url.searchParams.set("fixture", url.pathname === "/store/activate" ? "store-owner-activation" : "store-cost-owner");
          return route.fulfill({ response: await route.fetch({ url: url.toString() }) });
        }
        return route.continue();
      });
      await owner.route("**/api/store/accounts/activate", route => {
        calls.consent++;
        expect(route.request().postDataJSON()).toEqual({ token, termsAccepted: true });
        return route.fulfill({ json: { loginUrl, termsVersion: "2026-11-07" } });
      });
      const oauthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=synthetic&response_type=code&state=synthetic-${companyId}-${storeAccountId}`;
      await owner.route("**/api/auth/kakao/start?**", route => {
        calls.start++;
        const url = new URL(route.request().url());
        expect(Object.fromEntries(url.searchParams)).toEqual({ store: "1", companyId, storeAccountId, activation: "1" });
        return route.fulfill({ status: 302, headers: { location: oauthUrl } });
      });
      await owner.route("https://kauth.kakao.com/oauth/authorize?**", route => {
        calls.oauth++;
        expect(route.request().url()).toBe(oauthUrl);
        return route.fulfill({ status: 302, headers: { location: `${origin}/api/auth/kakao/callback?code=synthetic&state=synthetic` } });
      });
      await owner.route("**/api/auth/kakao/callback?**", route => {
        calls.callback++;
        return route.fulfill({ status: 302, headers: { location: origin + storeUrl } });
      });
      await owner.route("**/api/store/costs?**", route => {
        calls.costs++;
        const url = new URL(route.request().url());
        expect(url.searchParams.get("companyId")).toBe(companyId);
        expect(url.searchParams.get("storeAccountId")).toBe(storeAccountId);
        return route.fulfill({ json: { rows: [], hasMore: false, nextOffset: null } });
      });
      await owner.route("**/api/store/costs/import", route => {
        calls.imports++;
        return route.fulfill({ status: 503, json: { message: "No import in this entry-only journey" } });
      });
      const crm = await representative.newPage(), page = await owner.newPage();
      const assertPrivate = async (target: Page) => {
        const storage = await target.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage), document.cookie].join("\n"));
        expect(storage).not.toContain(token);
        expect(target.url()).not.toContain(token);
        expect(await target.locator("html").innerHTML()).not.toContain(token);
      };
      await crm.goto("/crm/timeline?section=ledger", { waitUntil: "domcontentloaded" });
      const create = crm.getByRole("button", { name: "매장 점주 개통 링크 만들기", exact: true });
      await expect(create).toBeVisible();
      expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await create.click();
      const issued = crm.getByLabel("점주 개통 링크", { exact: true });
      await expect(issued).toHaveValue(activationUrl);
      expect(calls.provision).toBe(1);
      expect(await crm.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].join("\n"))).not.toContain(token);
      expect(await crm.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
      await crm.screenshot({ path: info.outputPath(`owner-journey-issued-${width}.png`), fullPage: true });
      // The owner receives the link in a fresh context, with none of the representative's cookies.
      expect(await owner.cookies()).toEqual([]);
      await page.goto(await issued.inputValue());
      await expect.poll(() => new URL(page.url()).hash).toBe("");
      const start = page.getByRole("button", { name: "동의하고 카카오로 시작", exact: true });
      await expect(start).toBeDisabled();
      expect(calls.consent + calls.start + calls.oauth + calls.callback + calls.costs).toBe(0);
      await assertPrivate(page);
      await page.screenshot({ path: info.outputPath(`owner-journey-consent-${width}.png`), fullPage: true });
      await page.getByRole("checkbox").check();
      await start.click();
      await expect(page).toHaveURL(origin + storeUrl);
      await expect(page.getByText("매장 자체 원가관리", { exact: true })).toBeVisible();
      expect(calls).toMatchObject({ provision: 1, consent: 1, start: 1, oauth: 1, callback: 1, imports: 0, orders: 0 });
      await expect.poll(() => calls.costs).toBe(1);
      const upload = page.getByRole("button", { name: "엑셀 원가 업로드", exact: true });
      if (width === 1440) {
        await expect(upload).toBeEnabled();
        await upload.click();
        await expect(page.getByRole("region", { name: "엑셀 원가 업로드", exact: true }).getByLabel("원가 파일 선택")).toBeVisible();
      } else {
        await expect(upload).toBeHidden();
        await expect(page.getByText("PC에서 같은 매장 주소를 열어 주세요.", { exact: false })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`owner-journey-cost-entry-${width}.png`), fullPage: true });
      await assertPrivate(page);
      // Inspect Chromium's real session history, not a test-maintained URL list.
      const cdp = await owner.newCDPSession(page);
      const history = await cdp.send("Page.getNavigationHistory");
      expect(history.entries.map(entry => entry.url).join("\n")).not.toContain(token);
      await cdp.detach();
      for (const request of traffic) {
        expect(request.url + request.referer).not.toContain(token);
        if (request.path !== "/api/store/accounts/activate") expect(request.body).not.toContain(token);
      }
      // OFF: retain the existing empty-ID capability probe, but issue/auth/order/cost calls stay at zero.
      const before = { ...calls }, probesBefore = probes;
      enabled = false;
      await crm.reload({ waitUntil: "domcontentloaded" });
      await expect.poll(() => probes).toBeGreaterThan(probesBefore);
      await expect(create).toHaveCount(0);
      await page.goto(activationUrl);
      await expect.poll(() => new URL(page.url()).hash).toBe("");
      await assertPrivate(page);
      await expect(start).toBeDisabled();
      await page.goto(origin + storeUrl);
      await expect(page.getByRole("button", { name: "카카오로 매장 로그인", exact: true })).toBeDisabled();
      await expect(upload).toHaveCount(0);
      await assertPrivate(page);
      expect(calls).toEqual(before);
    } finally {
      await representative.close();
      await owner.close();
    }
  });
}
