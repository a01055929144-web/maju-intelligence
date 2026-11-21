import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const commonVegetable = "40000000-0000-4000-8000-000000000004";
const successCategory = "30000000-0000-4000-8000-000000000003";
const errorCategory = "30000000-0000-4000-8000-000000000005";

for (const width of [1440, 390]) test(`CX-95 common category mapping works at ${width}px`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width, height: width === 390 ? 844 : 900 } });
  try {
    const login = await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
    expect(login.ok()).toBeTruthy();
    const page = await context.newPage();
    const saved: Array<{ categoryId: string; majuCategoryId: string | null }> = [];
    await page.route("**/api/product-categories/matches**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: {
        businessType: "종합 식자재 유통",
        options: [{ id: commonVegetable, name: "식재료 > 농산 > 채소" }, { id: "40000000-0000-4000-8000-000000000006", name: "식재료 > 축산 > 육류" }],
        categories: [
          { id: successCategory, level: 3, name: "잎채소", path: "농산 > 채소 > 잎채소", majuCategoryId: "", commonCategoryName: "기타", suggestion: { id: commonVegetable, name: "식재료 > 농산 > 채소", score: 70 } },
          { id: errorCategory, level: 3, name: "간장", path: "공산 > 소스 > 간장", majuCategoryId: "", commonCategoryName: "기타", suggestion: null },
          { id: "30000000-0000-4000-8000-000000000007", level: 2, name: "육류", path: "축산 > 육류", majuCategoryId: "40000000-0000-4000-8000-000000000006", commonCategoryName: "식재료 > 축산 > 육류", suggestion: null },
        ],
      } });
      const body = route.request().postDataJSON() as { categoryId: string; majuCategoryId: string | null };
      if (body.categoryId === errorCategory) return route.fulfill({ status: 500, json: { message: "합성 저장 오류입니다." } });
      saved.push(body);
      return route.fulfill({ json: { id: body.categoryId, majuCategoryId: body.majuCategoryId } });
    });

    const response = await page.goto(`/revenue/products/common-categories?companyId=${companyId}`, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("농산 > 채소 > 잎채소", { exact: true })).toBeVisible();
    await expect(page.getByText("공산 > 소스 > 간장", { exact: true })).toBeVisible();
    await expect(page.getByText("현재 표시: 기타")).toHaveCount(2);

    await page.getByLabel("농산 > 채소 > 잎채소 공통 분류").selectOption(commonVegetable);
    await expect(page.getByRole("status")).toContainText("식재료 > 농산 > 채소");
    expect(saved).toEqual([{ categoryId: successCategory, majuCategoryId: commonVegetable }]);

    await page.getByLabel("공산 > 소스 > 간장 공통 분류").selectOption(commonVegetable);
    await expect(page.getByRole("alert").filter({ hasText: "합성 저장 오류입니다." })).toContainText("합성 저장 오류입니다.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cx95-common-categories-${width}.png`), fullPage: true });
  } finally { await context.close(); }
});
