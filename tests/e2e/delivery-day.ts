import type { Page } from "@playwright/test";

/** CX-145 P1-1: 배송일 달력에서 날짜를 고른다(다른 달이면 달을 넘긴다). */
export async function pickDeliveryDay(page: Page, day: string) {
  const cell = page.locator(`[data-day="${day}"]`);
  for (let step = 0; step < 24 && (await cell.count()) === 0; step++) {
    const current = (await page.locator('[data-day]').first().getAttribute("data-day"))!.slice(0, 7);
    await page.getByRole("button", { name: current < day.slice(0, 7) ? "다음 달" : "이전 달", exact: true }).click();
  }
  await cell.click();
}
