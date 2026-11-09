import { expect, test } from "@playwright/test";
const url = "/store/connection?companyId=00000000-0000-4000-8000-000000000001&storeAccountId=20000000-0000-4000-8000-000000000001";
for (const width of [1280, 390]) test(`owner closes store after confirmation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  let writes = 0;
  await page.route("**/api/store/connection**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { canLeave: false, canClose: true } });
    writes++;
    expect(route.request().postDataJSON().action).toBe("close");
    return route.fulfill({ json: { completed: true, action: "close" } });
  });
  await page.goto(url);
  await expect(page.getByText("매장 삭제 후에도 사업자정보", { exact: false })).toBeVisible();
  const button = page.getByRole("button", { name: "매장 삭제(이용 종료)" });
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  page.once("dialog", dialog => dialog.dismiss());
  await button.click(); expect(writes).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await button.click();
  await expect(page.getByRole("status")).toContainText("매장 이용이 종료됐습니다");
  await expect(button).toHaveCount(0); expect(writes).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
test("staff leaves only their own connection and failures remain retryable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let fail = true;
  await page.route("**/api/store/connection**", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { canLeave: true, canClose: false } });
    expect(route.request().postDataJSON().action).toBe("leave");
    return fail ? route.fulfill({ status: 409, json: { message: "현재 연결 상태를 확인해 주세요." } })
      : route.fulfill({ json: { completed: true, action: "leave" } });
  });
  await page.goto(url);
  await expect(page.getByRole("button", { name: "매장 삭제(이용 종료)" })).toHaveCount(0);
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "내 연결 해제", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("현재 연결 상태");
  fail = false;
  await page.getByRole("button", { name: "연결 상태 다시 확인" }).click();
  await page.getByRole("button", { name: "내 연결 해제", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("연결이 해제됐습니다");
});
test("OFF state offers a next action without exposing mutation buttons", async ({ page }) => {
  await page.route("**/api/store/connection**", route => route.fulfill({ status: 404, json: {} }));
  await page.goto(url);
  await expect(page.getByText("연결 관리 기능을 아직 사용할 수 없습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "매장 첫 화면으로" })).toBeVisible();
});
