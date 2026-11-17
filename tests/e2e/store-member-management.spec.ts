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

for (const width of [1440, 390]) test(`creates a store-wide staff invitation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.route("**/api/store/members**", async route => {
    if (route.request().method() === "POST") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ inviteUrl: "http://localhost:3000/store/invite#test-token" }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      actorMemberId: "owner", actorRole: "owner", profileMode: true, members: [
        { id: "owner", joinedAt: "2026-11-08T00:00:00Z", name: "점주", role: "owner", status: "active" }
      ]
    }) });
  });
  await page.goto("/store/members?companyId=00000000-0000-4000-8000-000000000001&storeAccountId=00000000-0000-4000-8000-000000000002");
  await page.getByLabel("이름 (구분용)").fill("주방 김OO");
  await page.getByRole("button", { name: "점장", exact: true }).click();
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  await expect(page.getByText("연결된 모든 유통사에서 같은 역할")).toBeVisible();
  await expect(page.getByRole("button", { name: "초대 링크 복사" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
