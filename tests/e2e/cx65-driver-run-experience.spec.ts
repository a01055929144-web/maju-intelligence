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
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "되돌리기" })).toBeVisible();
  await page.getByRole("button", { name: "되돌리기" }).click();
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
