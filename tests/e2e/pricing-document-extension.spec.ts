import { expect, test } from "@playwright/test";
import type { DocumentContent } from "../../domains/pricing/document";

test.use({ actionTimeout: 10000 });

for (const width of [1440, 390]) for (const mode of ["keep", "latest"] as const) test(`CX-121 extension journey ${mode} at ${width}px`, async ({ page }, info) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 900 });
  const id = "10000000-0000-4000-8000-000000000001";
  const product = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const line = (n: number) => ({ productId: product(n), displayName: `합성 품목 ${n}`, brand: "", spec: "1kg", unit: "봉", price: 100,
    taxType: "exempt" as const, visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" as const });
  const original: DocumentContent = { kind: "sheet", title: "합성 연장 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "",
    validUntil: "2099-01-01", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: [line(1), line(2)] };
  let content = structuredClone(original), revision = 1, published = false, writes = 0, failReview = true, losePublish = true;
  let lastPublish: unknown;
  const actions: string[] = [];
  const draft = () => ({ id, revision, content, updatedAt: "2026-11-18T00:00:00Z", recalculation: { publishedAt: "2026-11-18T00:00:00Z", needsRecalculation: false, changedProductCount: 0 } });
  const version = () => ({ id: "30000000-0000-4000-8000-000000000001", documentId: id, version: published ? 2 : 1, revision, content: published ? content : original, publishedAt: "2026-11-18T00:00:00Z", unavailablePromotions: [] });
  await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } });
  await page.route("**/api/pricing-documents*", async route => {
    const request = route.request(), url = new URL(request.url()), body = request.method() === "POST" ? request.postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    actions.push(action);
    let result: unknown = [];
    if (action === "list") result = { items: [draft()], total: 1 };
    if (action === "versions") result = [version()];
    if (action === "profile") result = { revision: 0, content: { companyName: "합성 유통", contact: "", footer: "" } };
    if (action === "catalog" || action === "extension-catalog") result = { items: [1, 2, 3].map(n => ({ ...line(n), id: product(n), name: `합성 품목 ${n}`, cost: 110, price: 130 })), total: 3 };
    if (action === "extension-review") {
      if (failReview) { failReview = false; return route.fulfill({ status: 503, json: { message: "최신 가격 확인 실패 · 다시 시도해 주세요." } }); }
      const next: DocumentContent = body.stage === "start" ? { ...structuredClone(original), validUntil: body.validUntil,
        lines: original.lines.map(l => ({ ...l, price: mode === "latest" ? 130 : l.price })) } : body.content;
      const old = new Map(original.lines.map(l => [l.productId, l]));
      result = { documentId: id, revision: body.expected, mode, token: "synthetic-server-bound-quote", content: next,
        summary: { unchanged: next.lines.filter(l => old.get(l.productId)?.price === l.price).length,
          changed: next.lines.filter(l => old.has(l.productId) && old.get(l.productId)!.price !== l.price).length,
          added: next.lines.filter(l => !old.has(l.productId)).length, removed: original.lines.filter(l => !next.lines.some(n => n.productId === l.productId)).length },
        loweredProfitCount: 1, minimumProfitRate: -10,
        lines: next.lines.map(l => ({ key: `${l.productId}:${l.promotionId}`, name: l.displayName, source: "base", promiseUntil: null,
          before: old.get(l.productId)?.price ?? null, calculated: 130, price: l.price, difference: l.price - 130,
          profitRate: l.price === 90 ? -10 : 15, belowThreshold: l.price < 130, manual: l.price === 90 })) };
    }
    if (action === "extension-save") { revision++; content = body.content; result = draft(); }
    if (action === "save" || action === "publish") throw new Error("ordinary write bypassed extension server");
    if (action === "extension-publish") {
      expect(body.token).toBe("synthetic-server-bound-quote");
      if (!lastPublish) { lastPublish = body; writes++; published = true; } else expect(body).toEqual(lastPublish);
      if (losePublish) { losePublish = false; return route.abort("failed"); }
      result = version();
    }
    await route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("checkbox", { name: "합성 연장 문서 선택", exact: true }).check();
  await page.getByRole("button", { name: "기간 연장", exact: true }).click();
  const choice = page.getByRole("dialog", { name: "약속가 연장", exact: true });
  await expect(choice.getByRole("radio", { checked: true })).toHaveCount(0);
  await choice.getByLabel("새 유효기간").fill("2099-02-01");
  await expect(choice.getByRole("button", { name: "기존 편집기에서 확인" })).toBeDisabled();
  await choice.getByRole("radio", { name: mode === "keep" ? "약속가 그대로 연장" : "최신 가격으로 다시 계산", exact: true }).check();
  await choice.getByRole("button", { name: "기존 편집기에서 확인" }).click();
  await expect(choice.getByRole("alert").filter({ hasText: "최신 가격 확인 실패" })).toBeVisible();
  expect(writes).toBe(0);
  await choice.getByRole("button", { name: "기존 편집기에서 확인" }).click();
  await expect(page.getByLabel("약속가 연장 편집")).toBeVisible();
  await page.getByLabel("품목 1 단가", { exact: true }).fill("90");
  await page.getByLabel("품목 1 단가", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "합성 품목 2 빼기", exact: true }).click();
  const quick = page.getByRole("textbox", { name: "문서에 품목 바로 추가", exact: true });
  await quick.fill("합성 품목 3");
  await page.getByRole("option").filter({ hasText: "합성 품목 3" }).getByRole("button").click();
  await page.getByLabel("유효기간", { exact: true }).fill("2099-03-01");
  if (width === 390) {
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("menuitem", { name: "표로 보기", exact: true }).click();
  } else await page.getByRole("tab", { name: "표", exact: true }).click();
  await page.getByRole("button", { name: "품목 2 위로", exact: true }).click();
  await page.getByRole("row").filter({ has: page.getByLabel("품목 1 선택", { exact: true }) }).getByRole("checkbox").last().uncheck();
  if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "초안 저장", exact: true }).click(); }
  else await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByText("초안을 저장했습니다.", { exact: true })).toBeVisible();
  expect(content.lines.map(l => l.productId)).toEqual([product(3), product(1)]);
  expect(content.lines[0].visible).toBe(false);
  expect(content.lines[0].price).toBe(130);
  expect(content.validUntil).toBe("2099-03-01");
  await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
  const review = page.getByRole("dialog", { name: "연장 게시 확인", exact: true });
  await expect(review.getByText("그대로 0 · 가격 바뀜 1 · 추가 1 · 삭제 1", { exact: true })).toBeVisible();
  await expect(review.getByText(/직접 수정/)).toBeVisible();
  await expect(review.getByText(/계산가와 차이 -40원/)).toBeVisible();
  await expect(review.getByText(/기준 미만 경고/)).toBeVisible();
  const publish = review.getByRole("button", { name: "새 약속가로 게시", exact: true });
  await expect(publish).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  expect((await publish.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath(`extension-${mode}-${width}.png`), fullPage: true });
  await publish.click();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText(/버전 2 연장 게시 완료/)).toBeVisible();
  expect(writes).toBe(1);
  expect(actions).toContain("extension-catalog");
  expect(original.lines.map(l => l.price)).toEqual([100, 100]);
});
