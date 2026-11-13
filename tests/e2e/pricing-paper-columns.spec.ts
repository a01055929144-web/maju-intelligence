import { expect, test } from "@playwright/test";
import { lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";

// CC-10: 편집 종이에서 선택한 열 수(1·2·3열)가 그대로 보여야 한다. 휴대폰(≤640px)은 1열.
const id = "10000000-0000-4000-8000-000000000001";
const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 아주 긴 이름의 냉동 감자튀김 슈스트링 대용량", displayName: "합성 아주 긴 이름의 냉동 감자튀김 슈스트링 대용량", brand: "", spec: "2.5kg×4입 / 냉동 보관 / 재포장 불가", unit: "박스", price: 1234567, taxType: "exempt" as const };
const content: DocumentContent = { kind: "sheet", title: "열 확인 문서", companyName: "합성", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, display: { columns: 1, promoLayout: "cards", info: [] }, lines: Array.from({ length: 12 }, (_, i) => lineFromCatalog({ ...product, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })) };

for (const width of [1920, 1440, 390]) test(`edit paper shows the selected 1/2/3 columns at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async (route) => {
    const action = new URL(route.request().url()).searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: [{ id, revision: 1, content, updatedAt: "2026-11-06T00:00:00Z", recalculation: { publishedAt: null, needsRecalculation: false, changedProductCount: 0 } }], total: 1 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
    if (action === "catalog") result = { items: [product], total: 1 };
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "열 확인 문서", exact: true }).click();
  const grid = page.locator(".pricing-edit-grid");
  await expect(grid.locator("table").first()).toBeVisible();
  for (const n of [1, 2, 3]) {
    await page.getByRole("button", { name: `${n}열`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${n}열`, exact: true })).toHaveAttribute("aria-pressed", "true");
    const { used, gridWidth } = await grid.evaluate((el) => ({ used: getComputedStyle(el).gridTemplateColumns.split(" ").length, gridWidth: el.getBoundingClientRect().width }));
    // 선택한 열 수까지. 한 열이 150px(+간격 16px)보다 좁아질 만큼 종이가 좁으면 들어가는 만큼만.
    expect(used).toBe(width <= 640 ? 1 : Math.min(n, Math.max(1, Math.floor((gridWidth + 16) / 166))));
    if (width === 1920 && n === 2) expect(used).toBe(2);
    // 좁은 열에서도 표가 칸 밖으로 넘치지 않고 단가 칸이 보인다.
    expect(await grid.evaluate((el) => { const edge = el.getBoundingClientRect().right + 1; return Array.from(el.querySelectorAll("input, button, [data-document-spec]")).filter((child) => child.getBoundingClientRect().right > edge).map((child) => `${child.tagName} ${child.getAttribute("aria-label") || ""} +${Math.round(child.getBoundingClientRect().right - edge)}px`); })).toEqual([]);
    await expect(page.getByRole("textbox", { name: "품목 1 단가", exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
