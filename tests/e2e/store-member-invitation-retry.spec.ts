import { expect, test } from "@playwright/test";

test("retries a temporary store member invitation failure without the URL fragment", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/store/members/accept", async route => {
    attempts += 1;
    await route.fulfill(attempts === 1
      ? { status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary" }) }
      : { status: 200, contentType: "application/json", body: JSON.stringify({ loginUrl: "/api/auth/kakao/start?store=1" }) });
  });
  await page.route("**/api/auth/kakao/start?store=1", route => route.fulfill({ status: 200, body: "ok" }));

  await page.goto(`/store/member-invite#${"a".repeat(43)}`);
  const button = page.getByRole("button", { name: "카카오로 초대 수락" });
  await button.click();
  await expect(page.locator('p[role="alert"]')).toContainText("초대가 만료되었거나 이미 사용되었습니다");
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(/\/store\/member-invite$/);

  await button.click();
  await expect.poll(() => attempts).toBe(2);
});
