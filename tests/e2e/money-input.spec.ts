import { expect, test } from "@playwright/test";

// CC-41: 판매가 칸은 쉼표로 보이고, 숫자만 입력해도 쉼표가 들어가며, 확정하면 숫자로 저장된다. 모바일은 숫자 키패드.
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`sales price input shows thousands separators at ${viewport.width}px`, async ({ page }) => {
    page.setDefaultTimeout(15_000);
    await page.setViewportSize(viewport);
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    const item = { id: "20000000-0000-4000-8000-000000000001", name: "합성 상품 1", category: "합성 > 분류", groupId: null, itemMargin: null, directPrice: null, cost: 50000, price: 56760, appliedCost: 50000, appliedMargin: 12, appliedRounding: 10, active: true };
    const list = () => ({ groups: [], categories: [], items: [item], defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: 1, page: 1, pageSize: 50, lastBatch: null, restored: false });
    const posts: Array<{ action?: string; price?: number }> = [];
    await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as { action?: string; price?: number };
        posts.push(body);
        if (typeof body.price === "number") { item.price = body.price; item.directPrice = body.price as never; }
      }
      return route.fulfill({ json: list() });
    });
    await page.route("**/api/price-sheets/categories*", (route) => route.fulfill({ json: { items: [] } }));
    page.on("dialog", (dialog) => void dialog.accept()); // 고정 가격 확인창
    await page.goto("/revenue/pricing/margins");
    const input = page.getByLabel("합성 상품 1 판매가");
    await expect(input).toHaveValue("56,760");
    await expect(input).toHaveAttribute("inputmode", "numeric");
    await input.fill("57000");
    await expect(input).toHaveValue("57,000");
    await input.press("Enter");
    await expect.poll(() => posts.at(-1)?.price).toBe(57000);
    await expect(input).toHaveValue("57,000");
  });
}
