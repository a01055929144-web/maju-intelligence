import { expect, test } from "@playwright/test";

test("CX-65 기사 운행 부품은 390px에서 화면과 키보드로 접근된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const stopId = "20000000-0000-4000-8000-000000000001";
  let undone = false;
  await page.route(/\/api\/mobile\/driver-sales-stops/, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { stops: [{ address: "서울 중구", id: stopId, leadId: "30000000-0000-4000-8000-000000000001", name: "가는 길 매장", order: 1, status: "planned" }] } });
    return route.fulfill({ json: { completedAt: new Date().toISOString(), ok: true, status: "견적 발송", stopId } });
  });
  await page.route(/\/api\/mobile\/driver-route-actions/, (route) => { undone = route.request().method() === "DELETE"; return route.fulfill({ json: { ok: true } }); });
  await page.goto("/mobile/today");

  const extras = page.getByTestId("driver-run-extras");
  await expect(extras).toBeVisible();
  await expect(extras.getByText(/화면 꺼짐 방지/)).toBeVisible();
  const box = await extras.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);

  const summary = extras.getByText("운행 종료 · 오늘 요약");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(extras.getByText("전달 못 함")).toBeVisible();
  await expect(extras.getByText("영업")).toBeVisible();
  await expect(extras.getByText("사진")).toBeVisible();

  await expect(page.getByText("가는 길 매장")).toBeVisible();
  const keyboardComplete = page.getByRole("button", { name: "밀어서 단가표 완료" });
  await keyboardComplete.focus();
  await expect(keyboardComplete).toBeFocused();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/mobile/driver-sales-stops") && response.request().method() === "POST"),
    page.keyboard.press("Enter"),
  ]);
  const undoButton = page.getByRole("button", { name: "되돌리기" });
  await expect(undoButton).toBeVisible({ timeout: 3_000 });
  await undoButton.focus();
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/mobile/driver-route-actions") && response.request().method() === "DELETE"),
    page.keyboard.press("Enter"),
  ]);
  expect(undone).toBe(true);
  await expect(page.getByText("방금 처리를 되돌렸습니다.")).toBeVisible();
  await expect(page.getByText("가는 길 매장")).toBeVisible();

  const issue = page.getByText("문제 품목 기록 (선택)");
  if (await issue.count()) {
    await issue.click();
    await page.getByRole("button", { name: "파손" }).click();
    await expect(page.getByRole("button", { name: "파손" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("이 기록은 금액이나 전표를 바꾸지 않습니다.")).toBeVisible();
  }
});

for (const width of [1440, 390]) {
  test(`CX-108 남은 정류장 일괄 완료와 사진 다중 선택은 ${width}px에서 동작한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const completedAt = "2026-11-18T10:00:00.000Z";
    let completedIds: string[] = [];
    let undone = false;
    await page.route("**/api/mobile/driver-route-actions", async (route) => {
      if (route.request().method() === "PATCH") {
        completedIds = route.request().postDataJSON().customerIds;
        return route.fulfill({ json: { completedAt, customerIds: completedIds, ok: true, stopIds: completedIds.map((_, index) => `20000000-0000-4000-8000-00000000000${index + 1}`) } });
      }
      if (route.request().method() === "DELETE") {
        undone = true;
        return route.fulfill({ json: { ok: true } });
      }
      return route.continue();
    });
    await page.goto("/mobile/today/cx108-preview");

    await page.getByRole("button", { name: "남은 3곳 전체 완료" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("남은 정류장을 모두 완료할까요?")).toBeVisible();
    await dialog.getByRole("button", { name: "3곳 완료" }).click();
    await expect(page.getByText("3곳 완료 · 5초 안에 되돌릴 수 있어요.")).toBeVisible();
    expect(completedIds).toHaveLength(3);
    await page.getByRole("button", { name: "되돌리기" }).click();
    expect(undone).toBe(true);
    await expect(page.getByText("방금 일괄 완료를 되돌렸습니다.")).toBeVisible();

    const photoInput = page.locator('#delivery-proof input[type="file"]');
    await expect(photoInput).toHaveAttribute("multiple", "");
    await photoInput.setInputFiles([
      { name: "완료-1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-photo-1") },
      { name: "완료-2.jpg", mimeType: "image/jpeg", buffer: Buffer.from("fake-photo-2") },
    ]);
    await expect(page.getByText("사진 2장 준비됨")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
