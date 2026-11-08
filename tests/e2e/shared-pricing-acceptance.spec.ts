import { expect, test } from "@playwright/test";
import { publicDocumentOutput } from "../../domains/pricing/document-share";
import type { DocumentContent } from "../../domains/pricing/document";

for (const width of [1440, 390]) test(`explicit acceptance preserves retry and link boundaries at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const content: DocumentContent = { kind: "quote", title: "합성 수락 견적", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    display: { columns: 1, promoLayout: "table", info: [], productWidth: 65, priceIncludesTax: true }, lines: [] };
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
  await expect(page.getByText("합성 수락 견적", { exact: true })).toBeVisible();
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
