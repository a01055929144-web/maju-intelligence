import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type AuthKind = "admin" | "customer";

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 }
] as const;

const routes: Array<{ auth: AuthKind; path: string; slug: string }> = [
  { auth: "admin", path: "/admin", slug: "admin" },
  { auth: "admin", path: "/admin/companies", slug: "admin-companies" },
  { auth: "admin", path: "/admin/companies/new", slug: "admin-company-new" },
  { auth: "admin", path: "/admin/companies/00000000-0000-4000-8000-000000000001/setup", slug: "admin-company-setup" },
  { auth: "admin", path: "/admin/billing", slug: "admin-billing" },
  { auth: "admin", path: "/admin/map", slug: "admin-map" },
  { auth: "customer", path: "/leads", slug: "leads" },
  { auth: "customer", path: "/leads/20000000-0000-4000-8000-000000000001", slug: "lead-detail" },
  { auth: "customer", path: "/insights", slug: "insights" },
  { auth: "customer", path: "/map", slug: "map" },
  { auth: "customer", path: "/dashboard", slug: "dashboard" },
  { auth: "customer", path: "/revenue/products", slug: "products" },
  { auth: "customer", path: "/crm/timeline", slug: "customers" },
  { auth: "customer", path: "/purchasing/suppliers", slug: "suppliers" },
  { auth: "customer", path: "/revenue/products?tab=imports", slug: "product-imports" },
  { auth: "customer", path: "/settings/billing", slug: "settings-billing" },
  { auth: "customer", path: "/dashboard/settings/company", slug: "settings-company" },
  { auth: "customer", path: "/dashboard/settings/staff", slug: "settings-staff" },
  { auth: "customer", path: "/dashboard/settings/routes", slug: "settings-routes" },
  { auth: "customer", path: "/dashboard/settings/advanced", slug: "settings-advanced" },
  { auth: "customer", path: "/mobile/sales", slug: "mobile-sales" },
  { auth: "customer", path: "/mobile/today", slug: "mobile-today" }
];

// Add only documented route and viewport debt here with its owning project number.
// The current populated CI layout has no known exceptions.
const knownLayoutDebt: Record<string, { owner: string; prefixes: string[] }> = {};

for (const width of [1440, 390]) {
  test(`pricing sheets can start a document and import a catalog item at ${width}px`, async ({ browser }, testInfo) => {
    const context = await authenticatedContext(browser, "customer", width, 844);
    try {
      const page = await context.newPage();
      await page.route("**/api/pricing-documents?*", async (route) => {
        const action = new URL(route.request().url()).searchParams.get("action");
        const product = { id: "30000000-0000-4000-8000-000000000001", productCode: "P-1", name: "양파", displayName: "양파", brand: "", spec: "10kg", unit: "박스", price: 12000, taxType: "exempt" };
        const result = action === "list" ? { items: [], total: 0 } : action === "sets" || action === "promotions" ? [] : action === "profile" ? { revision: 0, content: { companyName: "테스트 회사", contact: "", footer: "" } } : action === "catalog" ? { items: [product], total: 1 } : [];
        await route.fulfill({ json: { result, manager: true } });
      });
      const response = await page.goto("/revenue/pricing/documents", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByText("아직 문서가 없습니다.")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`pricing-sheets-${width}.png`), fullPage: false });
      await page.getByRole("button", { name: "+ 단가표" }).first().click();
      await page.getByRole("button", { name: /빈 단가표로 시작/ }).click();
      await page.locator('input[type="file"]').setInputFiles({ name: "품목.csv", mimeType: "text/csv", buffer: Buffer.from("ERP 코드,품목명,판매가\nP-1,양파,13000\n") });
      await expect(page.getByLabel("품목 1 노출 상품명")).toHaveValue("양파");
      expect((await collectLayoutProblems(page)).filter((problem) => problem.startsWith("horizontal-overflow"))).toEqual([]);
    } finally { await context.close(); }
  });
}

for (const width of [1440, 390]) {
  test(`purchase cost upload stays a candidate until save at ${width}px`, async ({ browser }, testInfo) => {
    const context = await authenticatedContext(browser, "customer", width, 844);
    const saved: Array<Record<string, unknown>> = [];
    try {
      const page = await context.newPage();
      const product = { id: "30000000-0000-4000-8000-000000000001", code: "P-000001", name: "양파", spec: "10kg", unit: "박스", cost: 10000, supplierName: "한빛유통", supplierCode: "ERP-1", supplierProductId: "40000000-0000-4000-8000-000000000001" };
      let currentCost = product.cost;
      await page.route("**/api/price-sheets/costs?*", async (route) => {
        await route.fulfill({ json: { products: [{ ...product, cost: currentCost }], suppliers: ["한빛유통"] } });
      });
      await page.route("**/api/price-sheets/costs", async (route) => {
        const body = route.request().postDataJSON() as { changes: Array<Record<string, unknown>> };
        saved.push(...body.changes);
        currentCost = Number(body.changes[0].cost);
        await route.fulfill({ json: { saved: body.changes.length } });
      });
      const priceState = { groups: [], categories: [], items: [], defaultMargin: 0, defaultRounding: 10, pendingCount: 0, total: 0, page: 1, pageSize: 30, lastBatch: null, restored: false };
      await page.route("**/api/price-sheets?*", async (route) => {
        await route.fulfill({ json: route.request().method() === "POST" ? { ...priceState, lastBatch: "50000000-0000-4000-8000-000000000001" } : priceState });
      });
      await page.route("**/api/pricing-documents?*", async (route) => {
        await route.fulfill({ json: { result: { items: [], total: 0 }, manager: true } });
      });
      const catalogReady = page.waitForResponse(response => response.url().includes("/api/price-sheets/costs?") && response.ok());
      const response = await page.goto("/revenue/pricing", { waitUntil: "domcontentloaded" });
      await catalogReady;
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByRole("heading", { name: "매입가 업로드" }).last()).toBeVisible();
      await page.getByRole("button", { name: "엑셀 올리기" }).click();
      await page.locator('input[type="file"]').setInputFiles({ name: "매입가.csv", mimeType: "text/csv", buffer: Buffer.from("ERP 코드,품목,규격,단위,매입처,매입가\nERP-1,양파,10kg,박스,한빛유통,12000\n") });
      await page.getByRole("button", { name: "② 열 정렬" }).click();
      await expect.poll(async () => (await page.locator('[role="status"],[role="alert"]').allTextContents()).join(" | ")).toContain("변경 후보 1개");
      expect(saved).toHaveLength(0);
      await page.getByRole("button", { name: "③ 저장 (1건)" }).click();
      await expect(page.getByText(/매입가 1건 저장/)).toBeVisible();
      expect(saved).toHaveLength(1);
      expect(saved[0].cost).toBe(12000);
      await page.screenshot({ path: testInfo.outputPath(`purchase-cost-${width}.png`), fullPage: false });
      expect((await collectLayoutProblems(page)).filter((problem) => problem.startsWith("horizontal-overflow"))).toEqual([]);
    } finally { await context.close(); }
  });
}

test("category selection stays compact and hides the internal code at 390px", async ({ browser }, testInfo) => {
  const context = await authenticatedContext(browser, "customer", 390, 844);
  try {
    const page = await context.newPage();
    const categories: Record<string, string> = { onion: "", sauce: "" };
    await page.route("**/api/product-catalog?*", (route) => route.fulfill({ json: { items: [
      { id: "onion", name: "양파", code: "P-00005", category: categories.onion, unit: "개", isActive: true },
      { id: "sauce", name: "간장", code: "P-00006", category: categories.sauce, unit: "병", isActive: true },
    ] } }));
    await page.route("**/api/price-sheets/categories?*", (route) => route.fulfill({ json: { items: [
      { id: "onion", name: "양파", code: "P-00005", spec: "1kg", unit: "개", category: categories.onion, suggestion: "농산 > 채소류 > 조미채소" },
      { id: "sauce", name: "간장", code: "P-00006", spec: "1L", unit: "병", category: categories.sauce, suggestion: "공산품 > 조미·장류 > 소스·드레싱" },
    ], options: ["농산", "농산 > 채소류", "농산 > 채소류 > 조미채소", "공산품", "공산품 > 조미·장류", "공산품 > 조미·장류 > 소스·드레싱"] } }));
    await page.route("**/api/price-sheets/products", (route) => { const items = route.request().postDataJSON().items as Array<{ id: string; category: string }>; for (const item of items) categories[item.id] = item.category; return route.fulfill({ json: { updated: items.length } }); });
    await page.route("**/api/price-sheets?*", (route) => route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: 0 } }));
    await page.goto("/revenue/products#product-category-management", { waitUntil: "domcontentloaded" });
    const manager = page.locator("#product-category-management");
    await expect(page.locator(".common-data-table-group")).toHaveCount(0);
    await expect(manager.getByLabel("양파 분류 검색 선택")).toBeVisible();
    await expect(manager.locator("tbody tr").first()).not.toContainText("P-00005");
    await manager.getByLabel("양파 분류 검색 선택").click();
    await expect(manager.getByRole("button", { name: "농산", exact: true })).toBeVisible();
    await manager.getByRole("button", { name: "농산", exact: true }).click();
    await manager.getByRole("button", { name: "채소류", exact: true }).click();
    await manager.getByRole("button", { name: "조미채소", exact: true }).click();
    await manager.getByRole("button", { name: "확인하고 저장 (1)" }).click();
    await expect(manager.getByLabel("양파 분류 검색 선택")).toContainText("농산 › 채소류 › 조미채소");
    expect(categories.onion).toBe("농산 > 채소류 > 조미채소");
    await manager.getByLabel("양파 분류 검색 선택").click();
    await manager.getByRole("button", { name: "공산품", exact: true }).click();
    await manager.getByRole("button", { name: "조미·장류", exact: true }).click();
    await manager.getByRole("button", { name: "소스·드레싱", exact: true }).click();
    await manager.getByRole("button", { name: "확인하고 저장 (1)" }).click();
    expect(categories.onion).toBe("공산품 > 조미·장류 > 소스·드레싱");
    await manager.getByLabel("양파 선택").check();
    await manager.getByLabel("간장 선택").check();
    await manager.getByLabel("옮길 분류 검색 선택").click();
    await manager.getByRole("button", { name: "농산", exact: true }).click();
    await manager.getByRole("button", { name: "채소류", exact: true }).click();
    await manager.getByRole("button", { name: "조미채소", exact: true }).click();
    await manager.getByRole("button", { name: "옮기기" }).click();
    await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
    expect(categories).toEqual({ onion: "농산 > 채소류 > 조미채소", sauce: "농산 > 채소류 > 조미채소" });
    await manager.getByText("분류 경로 이름·상위 위치 바꾸기").click();
    await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
    await manager.getByRole("button", { name: "농산", exact: true }).click();
    await manager.getByRole("button", { name: "채소류", exact: true }).click();
    await manager.getByRole("button", { name: "채소류까지 적용" }).click();
    await manager.getByLabel("새 분류 경로 검색 선택").click();
    await manager.getByLabel("새 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
    await manager.getByRole("button", { name: /신선채소.*새 분류로 선택/ }).click();
    await manager.getByRole("button", { name: "영향 2개 확인" }).click();
    await manager.getByRole("button", { name: "2개 상품에 적용" }).click();
    await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
    expect(categories).toEqual({ onion: "공산품 > 신선채소 > 조미채소", sauce: "공산품 > 신선채소 > 조미채소" });
    await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
    await manager.getByLabel("바꿀 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
    await expect(manager.getByRole("button", { name: /공산품 › 신선채소/ }).first()).toBeVisible();
    await manager.getByRole("button", { name: /공산품 › 신선채소/ }).first().click();
    await manager.getByRole("button", { name: "신선채소까지 적용" }).click();
    await manager.getByLabel("새 분류 경로 검색 선택").click();
    await manager.getByLabel("새 분류 경로 검색 선택 검색어").fill("공산품 > 신선식품");
    await manager.getByRole("button", { name: /신선식품.*새 분류로 선택/ }).click();
    await manager.getByRole("button", { name: "영향 2개 확인" }).click();
    await manager.getByRole("button", { name: "2개 상품에 적용" }).click();
    await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
    await expect(page.getByRole("status")).toContainText("2개 상품의 분류를 저장했습니다.");
    expect(categories).toEqual({ onion: "공산품 > 신선식품 > 조미채소", sauce: "공산품 > 신선식품 > 조미채소" });
    await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
    await manager.getByLabel("바꿀 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
    await expect(manager.getByText("맞는 분류가 없습니다.")).toBeVisible();
    await manager.screenshot({ path: testInfo.outputPath("category-picker-390.png") });
  } finally { await context.close(); }
});

for (const width of [1440, 390]) {
  test(`sidebar groups open by default and remember a closed group at ${width}px`, async ({ browser }) => {
    const context = await authenticatedContext(browser, "customer", width, 844);
    try {
      const page = await context.newPage();
      await page.goto("/map", { waitUntil: "domcontentloaded" });
      if (width === 390) await page.getByRole("button", { name: "메뉴 열기" }).click();
      const groups = page.locator('nav[aria-label="주요 작업공간"] > details');
      await expect(groups.first()).toBeVisible();
      expect(await groups.count()).toBeGreaterThan(1);
      for (const group of await groups.all()) await expect(group).toHaveAttribute("open", "");
      const otherGroup = groups.last();
      await otherGroup.locator("summary").click();
      await expect(otherGroup).not.toHaveAttribute("open", "");
      await page.reload({ waitUntil: "domcontentloaded" });
      if (width === 390) await page.getByRole("button", { name: "메뉴 열기" }).click();
      await expect(groups.last()).not.toHaveAttribute("open", "");
      await expect(groups.first()).toHaveAttribute("open", "");
    } finally { await context.close(); }
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]) {
  test(`WO-21 login stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      viewport
    });
    try {
      const page = await context.newPage();
      const response = await page.goto("/login/preview", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByPlaceholder("아이디")).toBeVisible();
      await expect(page.getByRole("link", { name: /카카오로 계속/ })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`wo-21-login-${viewport.width}.png`), fullPage: true });
      expect(await collectLayoutProblems(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]) {
  test(`WO-25 base price import mapping stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
    try {
      const page = await context.newPage();
      const response = await page.goto("/base-price-import/preview", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByText("기준 단가 열 맞추기")).toBeVisible();
      await expect(page.getByText("깐양파 10kg").filter({ visible: true }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`wo-25-base-price-import-${viewport.width}.png`), fullPage: true });
      expect(await collectLayoutProblems(page)).toEqual([]);
    } finally { await context.close(); }
  });

  test(`WO-25 import row editor stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
    try {
      const page = await context.newPage();
      const response = await page.goto("/import-row-editor/preview", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByText("가져오기 값 확인")).toBeVisible();
      await expect(page.getByText("원본: 1kg").filter({ visible: true }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`wo-25-import-row-editor-${viewport.width}.png`), fullPage: true });
      expect(await collectLayoutProblems(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`WO-21 role settings stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
    try {
      const page = await context.newPage();
      const response = await page.goto("/role-settings/preview", { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByText("직원 · 권한 일괄 설정")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`wo-21-role-settings-${viewport.width}.png`), fullPage: true });
      expect(await collectLayoutProblems(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

function splitKnownLayoutDebt(path: string, width: number, problems: string[]) {
  const entry = knownLayoutDebt[`${path}@${width}`];
  const allowedPrefixes = entry?.prefixes ?? [];
  return {
    owner: entry?.owner,
    known: problems.filter((problem) => allowedPrefixes.some((prefix) => problem.startsWith(prefix))),
    unexpected: problems.filter((problem) => !allowedPrefixes.some((prefix) => problem.startsWith(prefix)))
  };
}

async function authenticatedContext(browser: Browser, auth: AuthKind, width: number, height: number) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width, height }
  });
  const response = await context.request.post(auth === "admin" ? "/api/admin/login" : "/api/customer/login", {
    data:
      auth === "admin"
        ? { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" }
        : { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  });
  expect(response.ok(), `${auth} test login failed: ${response.status()}`).toBeTruthy();
  return context;
}

async function collectLayoutProblems(page: Page) {
  return page.evaluate(() => {
    const tolerance = 3;
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth + tolerance) {
      problems.push(`horizontal-overflow:${root.scrollWidth}>${root.clientWidth}`);
      const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 1 && rect.height > 1 && rect.right > innerWidth + tolerance)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 8)
        .map(({ element, rect }) => {
          const parent = element.parentElement;
          const ancestor = parent ? `${parent.tagName.toLowerCase()}.${String(parent.className).slice(0, 25)}:${getComputedStyle(parent).overflowX}:${parent.clientWidth}/${parent.scrollWidth}` : "none";
          return `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 35)}:${Math.round(rect.left)}..${Math.round(rect.right)}[${ancestor}]`;
        });
      problems.push(`overflow-elements:${offenders.join(" | ")}`);
    }

    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[role="button"]')
    ).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 4 && rect.height > 4;
    });

    for (const element of interactive) {
      const rect = element.getBoundingClientRect();
      if (rect.left < -tolerance || rect.right > innerWidth + tolerance) {
        // Tabs outside the visible part of an intentionally scrollable row are
        // reachable by scrolling that row; the row itself must still fit.
        let ancestor = element.parentElement;
        let insideScrollableRow = false;
        while (ancestor && ancestor !== root) {
          const style = getComputedStyle(ancestor);
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            (style.overflowX === "auto" || style.overflowX === "scroll") &&
            ancestor.scrollWidth > ancestor.clientWidth + tolerance &&
            ancestorRect.left >= -tolerance &&
            ancestorRect.right <= innerWidth + tolerance
          ) {
            insideScrollableRow = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (insideScrollableRow) continue;
        const label = (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40);
        problems.push(`clipped-control:${label}:${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }

    const suspiciousText = Array.from(document.querySelectorAll<HTMLElement>("button,a,label,th,[role=tab]"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const hit = document.elementFromPoint(
          Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
          Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
        );
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          !element.closest('[aria-hidden="true"],[hidden]') &&
          rect.right > 0 &&
          rect.left < innerWidth &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          Boolean(hit && (element.contains(hit) || hit.contains(element)))
        );
      })
      .filter((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const characters = (node.textContent || "").trim().replace(/\s/g, "").length;
          if (characters >= 4) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const lineTops = new Set(
              Array.from(range.getClientRects())
                .filter((rect) => rect.width > 1 && rect.height > 1)
                .map((rect) => Math.round(rect.top))
            );
            if (lineTops.size >= 3 && characters / lineTops.size <= 2) return true;
          }
          node = walker.nextNode();
        }
        return false;
      });
    for (const element of suspiciousText.slice(0, 10)) {
      problems.push(`narrow-text:${(element.textContent || "").trim().slice(0, 30)}`);
    }

    return Array.from(new Set(problems));
  });
}

for (const viewport of viewports) {
  test(`major routes stay responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
    const failures: string[] = [];
    for (const route of routes) {
      const context: BrowserContext = await authenticatedContext(browser, route.auth, viewport.width, viewport.height);
      try {
        const page = await context.newPage();
        const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
        if (!response || response.status() >= 400) {
          failures.push(`${route.path} @ ${viewport.width}px: HTTP ${response?.status() ?? "no response"}`);
          continue;
        }
        const expectedPathname = new URL(route.path, "http://127.0.0.1:3100").pathname;
        if (new URL(page.url()).pathname !== expectedPathname) {
          failures.push(`${route.path} @ ${viewport.width}px: redirected to ${new URL(page.url()).pathname}`);
          continue;
        }
        if (route.path === "/leads") {
          await expect(page.getByText("테스트 매장 01").first()).toBeVisible();
        }
        if (route.path === "/map") {
          await expect(page.getByText(/거래처 20곳/).filter({ visible: true }).first()).toBeVisible();
        }
        if (route.path === "/revenue/products") {
          await expect(page.getByText("깐양파").first()).toBeVisible();
        }
        if (route.slug === "product-imports") {
          await expect(page.getByText("한빛유통_11월_단가표.xlsx").first()).toBeVisible();
        }
        if (route.slug === "lead-detail") {
          await expect(page.getByText("테스트 매장 01").first()).toBeVisible();
        }
        if (route.slug === "admin-company-setup") {
          await expect(page.getByText("CI 화면 점검 회사 초기 설정")).toBeVisible();
        }
        await page.waitForTimeout(500);

        const screenshotPath = testInfo.outputPath(`${route.slug}-${viewport.width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        if (route.slug === "admin-companies" && (viewport.width === 1440 || viewport.width === 390)) {
          const history = page.locator("#company-import-history");
          await expect(history).toBeVisible();
          await history.scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`admin-company-import-history-${viewport.width}.png`), fullPage: false });
        }
        const problems = await collectLayoutProblems(page);
        const { owner, known, unexpected } = splitKnownLayoutDebt(route.path, viewport.width, problems);
        if (known.length > 0) {
          console.warn(`[known-layout-debt:${owner}] ${route.path} @ ${viewport.width}px: ${known.join(", ")}`);
        }
        if (unexpected.length > 0) {
          failures.push(`${route.path} @ ${viewport.width}px: ${unexpected.join(", ")}`);
        }
      } finally {
        await context.close();
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

