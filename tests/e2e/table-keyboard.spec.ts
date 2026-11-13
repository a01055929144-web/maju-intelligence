import { expect, test } from "@playwright/test";

// CC-44a: 공용 표 키보드 — 클릭 → ↓↓ → Enter → 7000 → Enter(저장, 아래 칸) → Esc 취소 → Space·Shift+↓ 선택 → Ctrl+C 복사.
test.use({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });

test("price table works like a spreadsheet from the keyboard", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const items = Array.from({ length: 6 }, (_, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: `합성 상품 ${i + 1}`, category: "합성 > 분류", groupId: null, itemMargin: null, directPrice: null as number | null, cost: 5000, price: 6000 + i * 100, appliedCost: 5000, appliedMargin: 12, appliedRounding: 10, active: true }));
  const posts: Array<{ productId?: string; price?: number }> = [];
  await page.route(/\/api\/price-sheets(?:\?|$)/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { productId?: string; price?: number };
      posts.push(body);
      const item = items.find((candidate) => candidate.id === body.productId);
      if (item && typeof body.price === "number") { item.price = body.price; item.directPrice = body.price; }
    }
    return route.fulfill({ json: { groups: [], categories: [], items, defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: items.length, page: 1, pageSize: 50, lastBatch: null, restored: false } });
  });
  await page.route("**/api/price-sheets/categories*", (route) => route.fulfill({ json: { items: [] } }));
  page.on("dialog", (dialog) => void dialog.accept()); // 가격 고정 확인창
  await page.goto("/revenue/pricing/margins");

  const price = (n: number) => page.getByLabel(`합성 상품 ${n} 판매가`);
  await expect(price(1)).toHaveValue("6,000");

  // 클릭(입력칸 밖 여백) → ↓↓ → 셋째 줄 판매가 칸이 현재 칸
  const cell = (row: number) => page.locator(`td[data-cell="${row}:${priceColumn}"]`);
  const priceColumn = await page.locator("thead th[data-col]").evaluateAll((ths) => ths.findIndex((th) => th.getAttribute("data-col") === "price"));
  expect(priceColumn).toBeGreaterThan(-1);
  await cell(0).click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(cell(2)).toHaveAttribute("aria-selected", "true");
  expect(items.map((item) => item.price)).toEqual([6000, 6100, 6200, 6300, 6400, 6500]); // ↑↓는 금액 값을 바꾸지 않는다

  // Enter = 편집 → 7000 → Enter = 저장 + 아래 칸 편집으로
  await page.keyboard.press("Enter");
  await expect(price(3)).toBeFocused();
  await page.keyboard.type("7000");
  await expect(price(3)).toHaveValue("7,000");
  await page.keyboard.press("Enter");
  await expect.poll(() => posts.at(-1)).toMatchObject({ productId: items[2].id, price: 7000 });
  await expect(price(4)).toBeFocused();

  // Esc = 입력 취소(원래 값), 표로 초점 복귀
  await page.keyboard.type("9999");
  await page.keyboard.press("Escape");
  await expect(price(4)).toHaveValue("6,300");
  await expect(cell(3)).toHaveAttribute("aria-selected", "true");
  expect(posts).toHaveLength(1);

  // Space·Shift+↓ = 3줄 선택, Ctrl+C = 탭 구분 복사
  await cell(0).click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByText("3개 선택", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const lines = copied.split("\n");
  expect(lines).toHaveLength(3);
  expect(lines[0].split("\t")).toContain("합성 상품 1");
  expect(lines[2].split("\t")).toContain("합성 상품 3");

  // ? = 도움말, Esc가 아닌 ?로 닫힘
  await page.locator("td[data-cell]").first().click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "표 단축키" })).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "표 단축키" })).toHaveCount(0);
});
