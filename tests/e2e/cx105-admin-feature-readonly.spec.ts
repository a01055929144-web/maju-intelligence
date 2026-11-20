import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`CX-105 회사별 기능 상태는 ${width}px에서 관리자에게만 읽기 전용으로 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/admin/system?featureFlags=1#feature-flags");
    await expect(page).toHaveURL(/\/admin\/login/);

    const login = await page.request.post("/api/admin/login", {
      data: {
        email: "ci-admin@example.test",
        password: "ci-admin-layout-password-2026",
      },
    });
    expect(login.ok()).toBeTruthy();

    await page.goto("/admin/system?featureFlags=1#feature-flags");
    await expect(page.getByRole("heading", { name: "회사별 기능 플래그" })).toBeVisible();
    await expect(page.getByText(/켜진 기능/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /켜기|끄기/ })).toHaveCount(0);
    await expect(page.getByText(/FEATURE_.*COMPANY_IDS/)).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });
}
