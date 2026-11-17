import { expect, test } from "@playwright/test";

// CC-73: 매출처 · 매입처가 같은 틀. 매출처 통합 화면: 목록 → 상세 → 전표 → 원장(가짜 원장 API). 매입처는 같은 위쪽 버튼 · 같은 목록 틀. 1440 · 390.
for (const width of [1440, 390]) {
  test(`매출처 통합 화면: 목록 → 상세 → 전표 → 원장 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    await page.route(/\/api\/partner-ledger/, (route) => route.fulfill({ json: { openingBalance: 0, closingBalance: 330000, entries: [{ id: "e1", entry_date: "2026-11-10", entry_type: "sale", amount: 330000, runningBalance: 330000, memo: "합성 매출" }] } }));
    await page.goto("/crm/timeline?section=partners");
    const toolbar = page.getByRole("toolbar", { name: "매출처 작업" });
    await expect(toolbar).toBeVisible();
    for (const name of ["등록", "엑셀 올리기", "전표 쓰기"]) await expect(toolbar.getByText(name)).toBeVisible();
    const list = page.getByRole("region", { name: "매출처 목록" });
    await expect(list).toBeVisible();
    const detail = page.getByRole("region", { name: "매출처 상세" });
    await list.getByRole("button", { name: /^테스트 거래처 02/ }).first().click();
    await expect(detail).toContainText("테스트 거래처 02");
    await detail.getByRole("tab", { name: "전표" }).click();
    await expect(detail.getByRole("link", { name: "전표 화면 열기" })).toHaveAttribute("href", /partnerType=customer&partnerId=/);
    await detail.getByRole("tab", { name: "원장" }).click();
    await expect(detail).toContainText("현재 미수금");
    await expect(detail).toContainText("합성 매출");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
  test(`매입처 화면도 같은 틀·같은 위쪽 버튼 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    await page.goto("/purchasing/suppliers");
    const toolbar = page.getByRole("toolbar", { name: "매입처 작업" });
    await expect(toolbar).toBeVisible();
    for (const name of ["등록", "엑셀 올리기", "전표 쓰기"]) await expect(toolbar.getByText(name)).toBeVisible();
    await expect(page.getByRole("region", { name: "매입처 목록" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
