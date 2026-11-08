import { expect, test } from "@playwright/test";

test("manages store members without horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/store/members?**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    actorMemberId: "owner", actorRole: "owner", members: [
      { id: "owner", joinedAt: "2026-11-08T00:00:00Z", name: "점주", role: "owner", status: "active" },
      { id: "staff", joinedAt: null, name: "초대 대기", role: "staff", status: "invited" }
    ]
  }) }));
  await page.goto("/store/members?companyId=00000000-0000-4000-8000-000000000001&storeAccountId=00000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "매장 구성원 관리" })).toBeVisible();
  await expect(page.getByRole("button", { name: "관리자 초대" })).toBeVisible();
  await expect(page.getByText("초대 대기").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
