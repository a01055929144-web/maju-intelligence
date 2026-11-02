import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`lead document selection and quote copy at ${width}px`, async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", viewport: { width, height: 900 } });
  const id = "10000000-0000-4000-8000-000000000001", productId = "30000000-0000-4000-8000-000000000001";
  let failed = false;
  const content = { kind: "sheet", title: "게시 행사 단가표", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "auto", showPrice: true, showBrand: true, showSpec: true,
    lines: [{ productId, displayName: "합성 상품", brand: "", spec: "1kg", unit: "봉", price: 100, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "행사" }] };
  const draft = { id, revision: 1, content: { ...content, title: "아직 게시하지 않은 수정 제목" }, updatedAt: "2026-11-02T01:00:00Z" };
  const version = { id: "40000000-0000-4000-8000-000000000001", documentId: id, revision: 1, version: 1, publishedAt: "2026-11-02T01:00:00Z", content, unavailablePromotions: [] };
  const writes: Array<{ action: string; content?: { kind: string; recipient: string; lines: Array<{ price: number }> } }> = [];
  try {
    expect((await context.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    await context.route("**/api/leads/outreach-policy*", route => route.fulfill({ json: { acknowledged: true } }));
    await context.route("**/api/pricing-documents*", async route => {
      const request = route.request(), url = new URL(request.url()), body = request.method() === "POST" ? request.postDataJSON() : {};
      const action = body.action || url.searchParams.get("action");
      if (action === "list" && failed) return route.fulfill({ status: 403, json: { message: "문서 작성 권한이 없습니다." } });
      let result: unknown = [];
      if (action === "list") result = { items: [draft], total: 1 };
      if (action === "versions") result = [version];
      if (action === "profile") result = { revision: 0, content: { companyName: "합성 유통", contact: "", footer: "" } };
      if (action === "catalog") result = { items: [{ id: productId, name: "합성 상품", displayName: "합성 상품", price: 100, cost: 50, taxType: "exempt", spec: "1kg", unit: "봉", brand: "" }], total: 1 };
      if (action === "save") { writes.push(body); result = { ...draft, id: body.id, revision: 1, content: body.content }; }
      if (action === "publish") { writes.push(body); result = { ...version, documentId: body.id, content: writes[0].content }; }
      return route.fulfill({ json: { result, manager: true } });
    });
    const page = await context.newPage();
    await page.goto("/leads/20000000-0000-4000-8000-000000000001");
    const panel = page.getByRole("region", { name: "리드 문서 보내기", exact: true });
    for (const name of width === 390 ? ["단가표 보내기", "견적 보내기"] : []) {
      expect((await panel.getByRole("button", { name, exact: true }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await panel.getByRole("button", { name: "단가표 보내기", exact: true }).click();
    await expect(panel.getByRole("button", { name: /아직 게시하지 않은 수정 제목/ })).toHaveCount(0);
    await panel.getByRole("button", { name: "임박", exact: true }).click();
    await expect(panel.getByText(/이 페이지에 선택할 수 있는 게시 단가표가 없습니다/)).toBeVisible();
    await panel.getByRole("button", { name: "행사", exact: true }).click();
    await panel.getByRole("button", { name: "게시 행사 단가표 · 버전 1 선택" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`lead-document-selection-${width}.png`) });
    await panel.getByRole("button", { name: "게시 행사 단가표 · 버전 1 선택" }).click();
    await expect(panel.getByRole("button", { name: "리드 공유 링크 발급" })).toBeDisabled();
    await expect(panel.getByText(/아직 링크를 발급하거나 발송 기록을 저장하지 않았습니다/)).toBeVisible();
    expect(writes).toHaveLength(0);
    await panel.getByRole("button", { name: "닫기", exact: true }).click();
    failed = true;
    await panel.getByRole("button", { name: "견적 보내기", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("문서 작성 권한이 없습니다.");
    failed = false;
    await panel.getByRole("button", { name: "다시 시도" }).click();
    await panel.getByRole("button", { name: "게시 행사 단가표 · 버전 1 복사" }).click();
    await expect(panel.getByLabel("품목 1 판매가")).toHaveValue("100");
    await panel.getByLabel("품목 1 판매가").fill("120");
    await panel.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(panel.getByText("초안을 저장했습니다.", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "판매가 버전 확정" }).click();
    await expect(panel.getByRole("button", { name: "리드 공유 링크 발급" })).toBeDisabled();
    expect(writes[0].content?.kind).toBe("quote");
    expect(writes[0].content?.recipient).toBe("테스트 매장 01");
    expect(writes[0].content?.lines[0].price).toBe(120);
    expect(content.lines[0].price).toBe(100);
    await panel.getByRole("button", { name: "리드 공유 링크 발급" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`lead-document-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBeTruthy();
  } finally { await context.close(); }
});
