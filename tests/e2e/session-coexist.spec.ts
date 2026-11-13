import { expect, test } from "@playwright/test";

// CC-39: 같은 브라우저에서 관리자·운영 로그인이 함께 유지된다. 로그아웃은 자기 사이트만, "모두 해제"는 전부.
test("admin and customer sessions coexist; logout is per site, logout-all clears both", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const admin = await page.request.post("/api/admin/login", { data: { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" } });
  expect(admin.ok()).toBeTruthy();
  const owner = await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  expect(owner.ok()).toBeTruthy();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin(\/)?$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).not.toHaveURL(/login/);

  // 운영 로그아웃은 관리자 로그인을 건드리지 않는다.
  expect((await page.request.post("/api/customer/logout")).ok()).toBeTruthy();
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);

  // 운영에 다시 로그인한 뒤, 모두 해제하면 둘 다 로그인 화면으로 간다.
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/auth/logout-all")).ok()).toBeTruthy();
  await page.goto("/admin");
  await expect(page).toHaveURL(/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
});
