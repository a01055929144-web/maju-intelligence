import { expect, test } from "@playwright/test";
import { publicDocumentOutput } from "../../domains/pricing/document-share";
import { lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";

for (const width of [1440, 390]) test(`explicit acceptance preserves retry and link boundaries at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const content: DocumentContent = { kind: "quote", title: "합성 수락 견적", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [], productWidth: 65, priceIncludesTax: true },
    lines: [lineFromCatalog({ id: "50000000-0000-4000-8000-000000000001", name: "합성 품목", displayName: "합성 품목", brand: "", spec: "1kg", unit: "봉", price: 1000, taxType: "taxable" })] };
  const document = publicDocumentOutput({ id: "version", documentId: "document", version: 1, revision: 1, publishedAt: "2026-11-08T00:00:00Z", content, unavailablePromotions: [] });
  const inputs: Record<string, unknown>[] = [];
  let mode = "retry";
  await page.route("**/api/pricing-documents/public", route => {
    const token = route.request().postDataJSON().token;
    if (token === "revoked") return route.fulfill({ status: 404, json: { message: "공유 문서를 사용할 수 없습니다." } });
    return route.fulfill({ json: { document, expiresAt: "2099-01-01T00:00:00Z", acceptanceAvailable: token !== "off" } });
  });
  await page.route("**/api/pricing-document-acceptance", route => {
    const input = route.request().postDataJSON(); inputs.push(input);
    expect(Object.keys(input).sort()).toEqual(["idempotencyKey", "shareToken"]);
    if (mode === "retry" && inputs.length === 1) return route.fulfill({ status: 503, json: { message: "합성 응답 유실. 다시 시도해 주세요." } });
    return route.fulfill({ json: { documentVersionId: "version", kind: "quote", needsReview: mode === "review", orderEnabled: mode !== "review", orderSetupRequired: mode === "setup", storefrontToken: "synthetic-order-token" } });
  });
  await page.goto("/pricing-document#off");
  await expect(page.getByText("합성 수락 견적", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "문서 수락 요청" })).toHaveCount(0);
  await page.goto("/pricing-document#one");
  const button = page.getByRole("button", { name: "문서 수락 요청", exact: true });
  await expect(button).toBeDisabled(); expect(inputs).toHaveLength(0);
  await page.getByRole("checkbox").check(); await button.click();
  await expect(page.getByRole("status")).toContainText("합성 응답 유실");
  await page.getByRole("button", { name: "수락 다시 시도", exact: true }).click();
  await expect(page.getByRole("link", { name: "주문 화면 열기" })).toHaveAttribute("href", "/store#synthetic-order-token");
  expect(inputs).toHaveLength(2); expect(inputs[0]).toEqual(inputs[1]);
  for (const state of ["review", "setup"]) {
    mode = state; await page.goto(`/pricing-document#${state}`);
    await page.getByRole("checkbox").check(); await button.click();
    await expect(page.getByRole("status")).toContainText(state === "review" ? "확인이 필요한 요청" : "주문 설정");
    await expect(page.getByRole("link", { name: "주문 화면 열기" })).toHaveCount(0);
    expect(inputs.at(-1)!.idempotencyKey).not.toBe(inputs[0].idempotencyKey);
    await page.screenshot({ path: info.outputPath(`acceptance-${state}-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  }
  await page.evaluate(() => { location.hash = "revoked"; });
  await expect(page.getByRole("status")).toContainText("공유 문서를 사용할 수 없습니다.");
  await expect(page.getByRole("region", { name: "문서 수락" })).toHaveCount(0);
});

for (const width of [1440, 390]) test(`CX-70 switches public document views at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 740 });
  let enabled = true, expired = false, member = false, catalogReads = 0;
  const itemKey = "a".repeat(32), productId = "00000000-0000-4000-8000-000000000001";
  const cart = [{ key: itemKey, quantity: 3 }];
  const signedToken = `${productId}.${"a".repeat(32)}.${"b".repeat(64)}`;
  await page.route("**/api/pricing-documents/public", route => route.fulfill({ json: {
    expiresAt: "2099-12-31T15:00:00Z",
    document: {
      title: "합성 주문 단가표", companyName: "합성 유통", kind: "sheet", layout: "cards", theme: "green",
      display: { columns: 2, info: [], productWidth: 65, promoLayout: "table", priceIncludesTax: false },
      validUntil: "2099-12-31", publishedAt: "2026-11-16T00:00:00Z", version: 1, expired,
      lines: [{ displayName: "합성 새우", spec: "1kg", unit: "봉", brand: "", price: expired ? null : 29700, badge: "" }],
    },
    orderEntry: { available: !expired, member, ...(enabled ? { shopping: true, cartScope: "cx70-fixture", itemKeys: [expired ? null : itemKey] } : {}) },
  } }));
  await page.goto("/pricing-document#cx70");
  const tabs = page.getByRole("navigation", { name: "공개 문서 보기" });
  await expect(tabs.getByRole("button", { name: "단가표 품목 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("29,700원", { exact: true }).filter({ visible: true })).toBeVisible();
  if (width === 1440) await expect(page.getByRole("table")).toHaveCount(1);
  const start = page.getByRole("button", { name: "카카오로 시작", exact: true });
  await expect(start).toBeVisible();

  const quantity = page.getByLabel("합성 새우 수량", { exact: true }).filter({ visible: true });
  await quantity.fill("3");
  await quantity.press("Tab");
  await expect(page.getByText(/담은 품목 1 · 수량 3/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/담은 품목 1 · 수량 3/)).toBeVisible();
  await page.screenshot({ path: info.outputPath(`cx70-link-${width}.png`) });

  await tabs.getByRole("button", { name: "문서 이미지" }).click();
  const image = page.getByRole("img", { name: "A4 문서 1쪽" });
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/, { timeout: 25000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.route("**/api/pricing-documents/shopping-catalog", route => {
    catalogReads++;
    expect(member).toBe(true);
    expect(route.request().postDataJSON()).toMatchObject({ token: "cx70", page: 1 });
    return route.fulfill({ json: { lines: [{ id: productId, name: "가입 후 상품", spec: "2kg", unit: "봉", price: 2000 }], hasMore: false } });
  });
  await tabs.getByRole("button", { name: /전체 상품/ }).click();
  await expect(page.getByRole("region", { name: "전체 상품" })).toContainText("가입하면 이 유통사의 전체 상품을 볼 수 있습니다.");
  await expect(page.getByText("29,700원", { exact: true }).filter({ visible: true })).toHaveCount(0);
  expect(catalogReads).toBe(0);
  await page.screenshot({ path: info.outputPath(`cx70-catalog-locked-${width}.png`) });
  await page.route("**/api/pricing-documents/order-intent", route => {
    expect(route.request().postDataJSON()).toEqual({ token: "cx70", cart });
    return route.fulfill({ json: member ? { next: "order", storeUrl: `/store?products=all#${signedToken}`,
      cart: [{ productId, promotionId: null, quantity: 3 }] } : { intent: "synthetic.cx70", next: "kakao" } });
  });
  await page.route("**/api/pricing-documents/shopping-cart", route => {
    expect(member).toBe(true);
    expect(route.request().postDataJSON()).toEqual({ token: "cx70" });
    return route.fulfill({ json: { quantities: { [itemKey]: 3 } } });
  });
  await page.route(url => url.pathname === "/store/activate", route => route.fulfill({ body: "<h1>합성 가입</h1>", contentType: "text/html; charset=utf-8" }));
  await start.click();
  await expect(page).toHaveURL(/\/store\/activate#synthetic\.cx70$/);
  member = true;
  await page.goto("/pricing-document?continueOrder=1#cx70");
  await expect(page).toHaveURL(/\/pricing-document\?view=cart#cx70$/);
  const savedCart = page.getByRole("region", { name: "장바구니" });
  await expect(savedCart).toContainText("합성 새우");
  await expect(savedCart).toContainText("3개");
  expect(await page.evaluate(() => localStorage.getItem("maju:public-cart:cx70-fixture"))).toBeNull();
  await page.reload();
  await expect(savedCart).toContainText("3개");
  await page.screenshot({ path: info.outputPath(`cx70-cart-${width}.png`) });
  await page.goto("/pricing-document#cx70");
  await tabs.getByRole("button", { name: "전체 상품", exact: true }).click();
  await expect(page.getByText("가입 후 상품", { exact: true }).filter({ visible: true })).toBeVisible();
  expect(catalogReads).toBe(1);
  await page.screenshot({ path: info.outputPath(`cx70-catalog-member-${width}.png`) });
  expired = true;
  await page.reload();
  const notice = page.getByRole("region", { name: "기간 지난 단가표" });
  await expect(notice).toContainText("새 단가표를 받으세요");
  await expect(notice.getByRole("link", { name: "받은 단가표로 돌아가기" })).toHaveAttribute("href", "/store?view=home");
  await expect(page.getByRole("button", { name: "주문 기간 종료" })).toBeDisabled();
  await expect(page.getByText("29,700원", { exact: true })).toHaveCount(0);

  enabled = false;
  expired = false;
  member = false;
  await page.reload();
  await expect(page.getByRole("button", { name: "이 단가로 주문 시작", exact: true })).toBeVisible();
  await expect(tabs).toHaveCount(0);
});
