# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: layout.spec.ts >> WO-21 login stays responsive at 1440px
- Location: tests\e2e\layout.spec.ts:227:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByPlaceholder('아이디')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByPlaceholder('아이디') with timeout 10000ms
  - waiting for getByPlaceholder('아이디')

```

```yaml
- alert
- main:
  - img
  - paragraph: MAJU
  - paragraph: 영업·배송 운영 플랫폼
  - paragraph: PAGE NOT FOUND
  - heading "요청하신 화면을 찾을 수 없습니다" [level=1]
  - paragraph: 주소가 변경되었거나 사용할 수 없는 링크입니다. 운영 지도에서 필요한 업무 화면으로 다시 이동해주세요.
  - link "지도 홈으로":
    - /url: /leads?type=permit
    - img
    - text: 지도 홈으로
  - link "로그인 화면":
    - /url: /dashboard/login
    - img
    - text: 로그인 화면
```

# Test source

```ts
  136 |       { id: "onion", name: "양파", code: "P-00005", spec: "1kg", unit: "개", category: categories.onion, suggestion: "농산 > 채소류 > 조미채소" },
  137 |       { id: "sauce", name: "간장", code: "P-00006", spec: "1L", unit: "병", category: categories.sauce, suggestion: "공산품 > 조미·장류 > 소스·드레싱" },
  138 |     ], options: ["농산", "농산 > 채소류", "농산 > 채소류 > 조미채소", "공산품", "공산품 > 조미·장류", "공산품 > 조미·장류 > 소스·드레싱"] } }));
  139 |     await page.route("**/api/price-sheets/products", (route) => { const items = route.request().postDataJSON().items as Array<{ id: string; category: string }>; for (const item of items) categories[item.id] = item.category; return route.fulfill({ json: { updated: items.length } }); });
  140 |     await page.route("**/api/price-sheets?*", (route) => route.fulfill({ json: { groups: [], categories: [], items: [], defaultMargin: 10, defaultRounding: 10, pendingCount: 0, total: 0 } }));
  141 |     await page.goto("/revenue/products?tab=categories#product-category-management", { waitUntil: "domcontentloaded" });
  142 |     const manager = page.locator("#product-category-management");
  143 |     await expect(page.locator(".common-data-table-group")).toHaveCount(0);
  144 |     await expect(manager.getByLabel("양파 분류 검색 선택")).toBeVisible();
  145 |     await expect(manager.locator("tbody tr").first()).not.toContainText("P-00005");
  146 |     await manager.getByLabel("양파 분류 검색 선택").click();
  147 |     await expect(manager.getByRole("button", { name: "농산", exact: true })).toBeVisible();
  148 |     await manager.getByRole("button", { name: "농산", exact: true }).click();
  149 |     await manager.getByRole("button", { name: "채소류", exact: true }).click();
  150 |     await manager.getByRole("button", { name: "조미채소", exact: true }).click();
  151 |     await manager.getByRole("button", { name: "확인하고 저장 (1)" }).click();
  152 |     await expect(manager.getByLabel("양파 분류 검색 선택")).toContainText("농산 › 채소류 › 조미채소");
  153 |     expect(categories.onion).toBe("농산 > 채소류 > 조미채소");
  154 |     await manager.getByLabel("양파 분류 검색 선택").click();
  155 |     await manager.getByRole("button", { name: "공산품", exact: true }).click();
  156 |     await manager.getByRole("button", { name: "조미·장류", exact: true }).click();
  157 |     await manager.getByRole("button", { name: "소스·드레싱", exact: true }).click();
  158 |     await manager.getByRole("button", { name: "확인하고 저장 (1)" }).click();
  159 |     expect(categories.onion).toBe("공산품 > 조미·장류 > 소스·드레싱");
  160 |     await manager.getByLabel("양파 선택").check();
  161 |     await manager.getByLabel("간장 선택").check();
  162 |     await manager.getByLabel("옮길 분류 검색 선택").click();
  163 |     await manager.getByRole("button", { name: "농산", exact: true }).click();
  164 |     await manager.getByRole("button", { name: "채소류", exact: true }).click();
  165 |     await manager.getByRole("button", { name: "조미채소", exact: true }).click();
  166 |     await manager.getByRole("button", { name: "옮기기" }).click();
  167 |     await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
  168 |     expect(categories).toEqual({ onion: "농산 > 채소류 > 조미채소", sauce: "농산 > 채소류 > 조미채소" });
  169 |     await manager.getByText("분류 경로 이름·상위 위치 바꾸기").click();
  170 |     await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
  171 |     await manager.getByRole("button", { name: "농산", exact: true }).click();
  172 |     await manager.getByRole("button", { name: "채소류", exact: true }).click();
  173 |     await manager.getByRole("button", { name: "채소류까지 적용" }).click();
  174 |     await manager.getByLabel("새 분류 경로 검색 선택").click();
  175 |     await manager.getByLabel("새 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
  176 |     await manager.getByRole("button", { name: /신선채소.*새 분류로 선택/ }).click();
  177 |     await manager.getByRole("button", { name: "영향 2개 확인" }).click();
  178 |     await manager.getByRole("button", { name: "2개 상품에 적용" }).click();
  179 |     await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
  180 |     expect(categories).toEqual({ onion: "공산품 > 신선채소 > 조미채소", sauce: "공산품 > 신선채소 > 조미채소" });
  181 |     await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
  182 |     await manager.getByLabel("바꿀 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
  183 |     await expect(manager.getByRole("button", { name: /공산품 › 신선채소/ }).first()).toBeVisible();
  184 |     await manager.getByRole("button", { name: /공산품 › 신선채소/ }).first().click();
  185 |     await manager.getByRole("button", { name: "신선채소까지 적용" }).click();
  186 |     await manager.getByLabel("새 분류 경로 검색 선택").click();
  187 |     await manager.getByLabel("새 분류 경로 검색 선택 검색어").fill("공산품 > 신선식품");
  188 |     await manager.getByRole("button", { name: /신선식품.*새 분류로 선택/ }).click();
  189 |     await manager.getByRole("button", { name: "영향 2개 확인" }).click();
  190 |     await manager.getByRole("button", { name: "2개 상품에 적용" }).click();
  191 |     await manager.getByRole("button", { name: "확인하고 저장 (2)" }).click();
  192 |     await expect(page.getByRole("status")).toContainText("2개 상품의 분류를 저장했습니다.");
  193 |     expect(categories).toEqual({ onion: "공산품 > 신선식품 > 조미채소", sauce: "공산품 > 신선식품 > 조미채소" });
  194 |     await manager.getByLabel("바꿀 분류 경로 검색 선택").click();
  195 |     await manager.getByLabel("바꿀 분류 경로 검색 선택 검색어").fill("공산품 > 신선채소");
  196 |     await expect(manager.getByText("맞는 분류가 없습니다.")).toBeVisible();
  197 |     await manager.screenshot({ path: testInfo.outputPath("category-picker-390.png") });
  198 |   } finally { await context.close(); }
  199 | });
  200 | 
  201 | for (const width of [1440, 390]) {
  202 |   test(`sidebar groups open by default and remember a closed group at ${width}px`, async ({ browser }) => {
  203 |     const context = await authenticatedContext(browser, "customer", width, 844);
  204 |     try {
  205 |       const page = await context.newPage();
  206 |       await page.goto("/map", { waitUntil: "domcontentloaded" });
  207 |       if (width === 390) await page.getByRole("button", { name: "메뉴 열기" }).click();
  208 |       const groups = page.locator('nav[aria-label="주요 작업공간"] > details');
  209 |       await expect(groups.first()).toBeVisible();
  210 |       expect(await groups.count()).toBeGreaterThan(1);
  211 |       for (const group of await groups.all()) await expect(group).toHaveAttribute("open", "");
  212 |       const otherGroup = groups.last();
  213 |       await otherGroup.locator("summary").click();
  214 |       await expect(otherGroup).not.toHaveAttribute("open", "");
  215 |       await page.reload({ waitUntil: "domcontentloaded" });
  216 |       if (width === 390) await page.getByRole("button", { name: "메뉴 열기" }).click();
  217 |       await expect(groups.last()).not.toHaveAttribute("open", "");
  218 |       await expect(groups.first()).toHaveAttribute("open", "");
  219 |     } finally { await context.close(); }
  220 |   });
  221 | }
  222 | 
  223 | for (const viewport of [
  224 |   { width: 1440, height: 900 },
  225 |   { width: 390, height: 844 }
  226 | ]) {
  227 |   test(`WO-21 login stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
  228 |     const context = await browser.newContext({
  229 |       baseURL: "http://127.0.0.1:3100",
  230 |       viewport
  231 |     });
  232 |     try {
  233 |       const page = await context.newPage();
  234 |       const response = await page.goto("/login/preview", { waitUntil: "domcontentloaded" });
  235 |       expect(response?.ok()).toBeTruthy();
> 236 |       await expect(page.getByPlaceholder("아이디")).toBeVisible();
      |                                                  ^ Error: expect(locator).toBeVisible() failed
  237 |       await expect(page.getByRole("link", { name: /카카오로 계속/ })).toBeVisible();
  238 |       await page.screenshot({ path: testInfo.outputPath(`wo-21-login-${viewport.width}.png`), fullPage: true });
  239 |       expect(await collectLayoutProblems(page)).toEqual([]);
  240 |     } finally {
  241 |       await context.close();
  242 |     }
  243 |   });
  244 | }
  245 | 
  246 | for (const viewport of [
  247 |   { width: 1440, height: 900 },
  248 |   { width: 390, height: 844 }
  249 | ]) {
  250 |   test(`WO-25 base price import mapping stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
  251 |     const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
  252 |     try {
  253 |       const page = await context.newPage();
  254 |       const response = await page.goto("/base-price-import/preview", { waitUntil: "domcontentloaded" });
  255 |       expect(response?.ok()).toBeTruthy();
  256 |       await expect(page.getByText("기준 단가 열 맞추기")).toBeVisible();
  257 |       await expect(page.getByText("깐양파 10kg").filter({ visible: true }).first()).toBeVisible();
  258 |       await page.screenshot({ path: testInfo.outputPath(`wo-25-base-price-import-${viewport.width}.png`), fullPage: true });
  259 |       expect(await collectLayoutProblems(page)).toEqual([]);
  260 |     } finally { await context.close(); }
  261 |   });
  262 | 
  263 |   test(`WO-25 import row editor stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
  264 |     const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
  265 |     try {
  266 |       const page = await context.newPage();
  267 |       const response = await page.goto("/import-row-editor/preview", { waitUntil: "domcontentloaded" });
  268 |       expect(response?.ok()).toBeTruthy();
  269 |       await expect(page.getByText("가져오기 값 확인")).toBeVisible();
  270 |       await expect(page.getByText("원본: 1kg").filter({ visible: true }).first()).toBeVisible();
  271 |       await page.screenshot({ path: testInfo.outputPath(`wo-25-import-row-editor-${viewport.width}.png`), fullPage: true });
  272 |       expect(await collectLayoutProblems(page)).toEqual([]);
  273 |     } finally {
  274 |       await context.close();
  275 |     }
  276 |   });
  277 | 
  278 |   test(`WO-21 role settings stays responsive at ${viewport.width}px`, async ({ browser }, testInfo) => {
  279 |     const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport });
  280 |     try {
  281 |       const page = await context.newPage();
  282 |       const response = await page.goto("/role-settings/preview", { waitUntil: "domcontentloaded" });
  283 |       expect(response?.ok()).toBeTruthy();
  284 |       await expect(page.getByText("직원 · 권한 일괄 설정")).toBeVisible();
  285 |       await page.screenshot({ path: testInfo.outputPath(`wo-21-role-settings-${viewport.width}.png`), fullPage: true });
  286 |       expect(await collectLayoutProblems(page)).toEqual([]);
  287 |     } finally {
  288 |       await context.close();
  289 |     }
  290 |   });
  291 | }
  292 | 
  293 | function splitKnownLayoutDebt(path: string, width: number, problems: string[]) {
  294 |   const entry = knownLayoutDebt[`${path}@${width}`];
  295 |   const allowedPrefixes = entry?.prefixes ?? [];
  296 |   return {
  297 |     owner: entry?.owner,
  298 |     known: problems.filter((problem) => allowedPrefixes.some((prefix) => problem.startsWith(prefix))),
  299 |     unexpected: problems.filter((problem) => !allowedPrefixes.some((prefix) => problem.startsWith(prefix)))
  300 |   };
  301 | }
  302 | 
  303 | async function authenticatedContext(browser: Browser, auth: AuthKind, width: number, height: number) {
  304 |   const context = await browser.newContext({
  305 |     baseURL: "http://127.0.0.1:3100",
  306 |     viewport: { width, height }
  307 |   });
  308 |   const response = await context.request.post(auth === "admin" ? "/api/admin/login" : "/api/customer/login", {
  309 |     data:
  310 |       auth === "admin"
  311 |         ? { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" }
  312 |         : { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" }
  313 |   });
  314 |   expect(response.ok(), `${auth} test login failed: ${response.status()}`).toBeTruthy();
  315 |   return context;
  316 | }
  317 | 
  318 | async function collectLayoutProblems(page: Page) {
  319 |   return page.evaluate(() => {
  320 |     const tolerance = 3;
  321 |     const problems: string[] = [];
  322 |     const root = document.documentElement;
  323 |     if (root.scrollWidth > root.clientWidth + tolerance) {
  324 |       problems.push(`horizontal-overflow:${root.scrollWidth}>${root.clientWidth}`);
  325 |       const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
  326 |         .map((element) => ({ element, rect: element.getBoundingClientRect() }))
  327 |         .filter(({ rect }) => rect.width > 1 && rect.height > 1 && rect.right > innerWidth + tolerance)
  328 |         .sort((a, b) => b.rect.right - a.rect.right)
  329 |         .slice(0, 8)
  330 |         .map(({ element, rect }) => {
  331 |           const parent = element.parentElement;
  332 |           const ancestor = parent ? `${parent.tagName.toLowerCase()}.${String(parent.className).slice(0, 25)}:${getComputedStyle(parent).overflowX}:${parent.clientWidth}/${parent.scrollWidth}` : "none";
  333 |           return `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 35)}:${Math.round(rect.left)}..${Math.round(rect.right)}[${ancestor}]`;
  334 |         });
  335 |       problems.push(`overflow-elements:${offenders.join(" | ")}`);
  336 |     }
```