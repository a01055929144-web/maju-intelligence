import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`lead detail exposes document writers without recording delivery at ${width}px`, async ({ page }) => {
    const leadId = "20000000-0000-4000-8000-000000000001";
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    expect((await page.request.post("/api/customer/login", {
      data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
    })).ok()).toBeTruthy();

    const sendRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("record-send") || request.url().includes("pricing-store-links")) sendRequests.push(request.url());
    });

    await page.goto(`/leads/${leadId}`);
    const sheet = page.getByRole("link", { name: "단가표 만들기", exact: true });
    const quote = page.getByRole("link", { name: "견적서 만들기", exact: true });
    await expect(sheet).toHaveAttribute("href", `/revenue/pricing/documents?start=sheet&leadId=${leadId}`);
    await expect(quote).toHaveAttribute("href", `/revenue/pricing/documents?start=quote&leadId=${leadId}`);
    await expect(page.getByText("작성·게시 후 별도로 전달해야 합니다.", { exact: true })).toBeVisible();
    expect((await sheet.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await quote.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    expect(sendRequests).toEqual([]);
  });
}
