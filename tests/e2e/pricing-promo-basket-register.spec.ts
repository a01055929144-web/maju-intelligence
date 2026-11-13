import { expect, test } from "@playwright/test";

// CC-34-2: ?add=1 로 담기 서랍을 열고 상품 3개를 체크해 담으면 3줄, 한 번에 등록하면 save-promotion이 3번 불린다.
const products = [1, 2, 3].map((n) => ({ id: `20000000-0000-4000-8000-00000000000${n}`, code: `P${n}`, name: `합성 담기 상품 ${n}`, displayName: `합성 담기 상품 ${n}`, spec: "1kg", unit: "박스", category: "합성" }));
const catalog = products.map((p) => ({ ...p, brand: "", price: 10000, cost: 8000, taxType: "exempt" as const }));

test("promotion basket: pick 3 products, add, register all", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  let saved = 0;
  await page.route("**/api/pricing-documents/catalog-index*", (route) => route.fulfill({ json: { items: products } }));
  await page.route("**/api/pricing-documents*", async (route) => {
    const action = new URL(route.request().url()).searchParams.get("action") || "list";
    if (route.request().method() === "POST" && action === "save-promotion") saved += 1;
    let result: unknown = [];
    if (action === "catalog") result = { items: catalog, total: 3 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/promotions?add=1");
  const drawer = page.getByRole("dialog", { name: /상품 담기/ });
  await expect(drawer).toBeVisible();
  for (const p of products) await drawer.getByRole("checkbox", { name: `${p.displayName} 선택` }).check();
  await drawer.getByRole("button", { name: "선택 3개 담기" }).click();
  await expect(drawer.getByRole("button", { name: /3개 행사 등록/ })).toBeVisible();
  await drawer.getByRole("button", { name: /3개 행사 등록/ }).click();
  await expect.poll(() => saved).toBe(3);
});
