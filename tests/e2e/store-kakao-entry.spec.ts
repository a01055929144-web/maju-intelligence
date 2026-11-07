import { expect, test } from "@playwright/test";

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
  await page.goto(`/store?companyId=${companyId}&storeAccountId=${storeAccountId}`);
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
