import { expect, test } from "@playwright/test";

// CC-47-4: 삭제 확인 창(영업 자료 삭제) — 취소·Esc면 안 지워지고, 확인하면 지워진다. 가짜 데이터·가짜 API만 쓴다.
for (const width of [1440, 390]) test(`삭제 확인 창: 취소·Esc는 그대로, 확인하면 삭제 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const kit = (materials: Array<{ code: string; kind: string; name: string; uploadedAt: string }>) => ({ contactLabel: "", contactPhone: "", defaults: {}, fields: [], materials, orderCode: "", orderUrl: "" });
  let materials = [{ code: "abc1234", kind: "price_sheet", name: "가짜단가표.pdf", uploadedAt: "2026-11-14T00:00:00Z" }];
  const deleted: string[] = [];
  await page.route(/\/api\/sales-kit(\?|$)/, (route) => route.fulfill({ json: { canEdit: true, fallbackPhone: "", kit: kit(materials) } }));
  await page.route(/\/api\/sales-kit\/file\?code=/, (route) => {
    deleted.push(new URL(route.request().url()).searchParams.get("code") ?? "");
    materials = [];
    return route.fulfill({ json: { kit: kit(materials) } });
  });
  await page.goto("/dashboard/settings/sales");

  const trigger = page.getByRole("button", { name: "가짜단가표.pdf 삭제" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "확인" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("가짜단가표.pdf");
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();

  // 취소: 안 지워지고, 포커스는 눌렀던 버튼으로 돌아온다.
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(deleted).toEqual([]);

  // Esc도 취소.
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(deleted).toEqual([]);
  await expect(trigger).toBeVisible();

  // 확인: 삭제 요청이 한 번 가고 목록에서 사라진다.
  await trigger.click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("button", { name: "가짜단가표.pdf 삭제" })).toHaveCount(0);
  expect(deleted).toEqual(["abc1234"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});
