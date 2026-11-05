import { expect, test } from "@playwright/test";
import { lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";

for (const width of [1440, 390]) test(`public order link shows published spec at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route("**/api/storefront", route => route.fulfill({ json: {
    store: { title: "합성 공개 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "합성 주소", version: 2, validUntil: "2099-12-31", priceAvailable: true, canOrder: false, nextDeliveryDate: null, selectedDeliveryDate: "2099-01-01", notice: "", marketPriceNotice: "", policy: { weekdays: [], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 }, lines: [{ key: "product", productId: "product", promotionId: null, name: "합성 미림", brand: "", spec: "18L", unit: "통", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
    orders: [], preferences: [], historyPage: 1, historyHasMore: false,
  } }));
  await page.goto("/store#synthetic-spec-link");
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(page.getByText("18L · 통", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "원가관리", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) {
  test(`${kind} specs preserve published snapshots at ${width}px`, async ({ page }, info) => {
    const id = "10000000-0000-4000-8000-000000000001";
    const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 미림", displayName: "합성 미림", brand: "", spec: "18L", unit: "통", price: 1000, taxType: "exempt" as const };
    const products = Array.from({ length: 16 }, (_, i) => ({ ...product, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
    let revision = 1;
    let content: DocumentContent = { kind, title: "규격 회귀 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: products.map((item, i) => ({ ...lineFromCatalog({ ...item, spec: " " }), displayName: `합성 품목 ${i + 1}` })) };
    const oldContent = structuredClone(content);
    const draft = () => ({ id, revision, content: { ...content, lines: content.lines.map(line => ({ ...line, spec: revision === 1 ? null : line.spec })) }, updatedAt: "2026-11-05T01:00:00Z", recalculation: { publishedAt: "2026-11-05T01:00:00Z", needsRecalculation: false, changedProductCount: 0 } });
    const version = (number: number) => ({ id: `30000000-0000-4000-8000-00000000000${number}`, documentId: id, version: number, revision, publishedAt: "2026-11-05T01:00:00Z", content: number === 1 ? { ...oldContent, lines: oldContent.lines.map(line => ({ ...line, spec: null })) } : structuredClone(content), unavailablePromotions: [], promotionStock: {} });
    let published = false;
    const login = await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
    expect(login.ok()).toBeTruthy();
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/pricing-documents*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: products.map(item => ({ ...item, code: "SYNTHETIC" })) } });
      const body = request.method() === "POST" ? request.postDataJSON() : {};
      const action = body.action || url.searchParams.get("action") || "list";
      let result: unknown = [];
      if (action === "list") result = { items: [draft()], total: 1 };
      if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
      if (action === "catalog") result = { items: products, total: 16 };
      if (action === "versions") result = published ? [version(2), version(1)] : [version(1)];
      if (action === "save") { content = body.content; revision++; result = draft(); }
      if (action === "publish") { published = true; result = version(2); }
      await route.fulfill({ json: { result, manager: true } });
    });
    await page.goto("/revenue/pricing/documents");
    await page.getByRole("button", { name: "규격 회귀 문서", exact: true }).click();
    await expect(page.getByText(/기존 발행본의 규격은 그대로 유지됩니다/)).toBeVisible();
    const fill = page.getByRole("button", { name: "빈 규격 원장에서 채우기", exact: true });
    if (width === 390) expect((await fill.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await fill.click();
    await expect(page.getByRole("status").filter({ hasText: "원장 규격 16개" })).toBeVisible();
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "초안을 저장했습니다" })).toBeVisible();
    expect(content.lines.map(line => line.spec)).toEqual(Array(16).fill("18L"));
    expect(oldContent.lines.every(line => line.spec === " ")).toBe(true);
    await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /버전 2.*확정했습니다/ })).toBeVisible();
    await page.getByRole("button", { name: /버전 2 미리보기/ }).click();
    const dialog = page.getByRole("dialog", { name: "미리보기", exact: true });
    await expect(dialog.locator(".pricing-paper").first()).toBeVisible();
    expect(await dialog.locator(".pricing-paper").allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining("18L")]));
    await expect(dialog.getByRole("heading", { name: "온라인 · 휴대폰" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
    await page.screenshot({ path: info.outputPath(`${kind}-spec-${width}.png`), fullPage: true });
    if (width === 1440) await page.pdf({ path: info.outputPath(`${kind}-spec-a4.pdf`), format: "A4", printBackground: true });
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
    expect((await page.getByRole("dialog", { name: "미리보기", exact: true }).locator(".pricing-paper").allTextContents()).join("")).not.toContain("18L");
  });
}
