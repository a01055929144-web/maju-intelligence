import { expect, test, type Route } from "@playwright/test";
import { publicDocumentOutput } from "../../domains/pricing/document-share";
import type { DocumentContent, DocumentVersion } from "../../domains/pricing/document";

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) test(`lead ${kind} prepare, explicit delivery and public read at ${width}px`, async ({ page, browser }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const leadId = "20000000-0000-4000-8000-000000000001", versionId = "40000000-0000-4000-8000-000000000001";
  const shareLinkId = "50000000-0000-4000-8000-000000000001", sendId = "60000000-0000-4000-8000-000000000001";
  const otherDocument = "70000000-0000-4000-8000-000000000001";
  const companyId = "00000000-0000-4000-8000-000000000001", customerId = "80000000-0000-4000-8000-000000000001";
  let releaseOtherVersions: (() => void) | undefined;
  const product = { id: "30000000-0000-4000-8000-000000000001", name: "합성 공개 품목", displayName: "합성 공개 품목", brand: "합성 브랜드", spec: "18L", unit: "통", price: 1000, taxType: "exempt" };
  let content: DocumentContent | undefined, documentId = "", revision = 0, published = false, profileRead = false;
  let linkExpiresAt = "2099-01-01T00:00:00Z";
  let failPrepare = true, failSend = true, prepared = false, sent = false, revoked = false, readError = false, expiredPrice = false;
  const prepareInputs: Record<string, unknown>[] = [], sendInputs: Record<string, unknown>[] = [];
  const deliveryRecords = new Map<string, string>(), contactRecords = new Map<string, string>();
  let printed = 0, orderLinks = 0, publishedContent: DocumentContent | undefined;
  await page.exposeFunction("fixturePrinted", () => { printed++; });
  await page.addInitScript(() => { window.print = () => { void (window as Window & { fixturePrinted: () => Promise<void> }).fixturePrinted(); }; });
  const token = "synthetic-purpose-signed-token", publicUrl = `/pricing-document#${token}`;
  const draft = () => ({ id: documentId, revision, content, updatedAt: "2026-11-06T00:00:00Z", recalculation: { publishedAt: published ? "2026-11-06T00:00:00Z" : null, needsRecalculation: false, changedProductCount: 0 } });
  const version = (): DocumentVersion => ({ id: versionId, documentId, version: 1, revision, content: publishedContent!, publishedAt: "2026-11-06T00:00:00Z", unavailablePromotions: [] });
  await page.route("**/api/pricing-store-links*", route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ companyId, action: "create", customerId, documentVersionId: versionId });
      orderLinks++;
      return route.fulfill({ json: { url: "https://store.example.test/store#synthetic-stage-b-order-token" } });
    }
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { items: [{ id: customerId, customer_name: "합성 QR 매장" }], nextCursor: null } });
  });
  await page.route(/\/api\/pricing-documents(?:\/catalog-index)?(?:\?.*)?$/, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const b = request.method() === "POST" ? request.postDataJSON() : {};
    const action = b.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: content ? [draft(), { ...draft(), id: otherDocument, content: { ...content, title: "합성 다른 문서" } }] : [], total: content ? 2 : 0 };
    if (action === "profile") { profileRead = true; result = { revision: 0, content: { companyName: "합성 유통", contact: "PRIVATE-CONTACT-CANARY", footer: "PRIVATE-FOOTER-CANARY" } }; }
    if (action === "catalog") result = { items: [product], total: 1 };
    if (action === "versions") {
      if (url.searchParams.get("id") === otherDocument) await new Promise<void>(resolve => { releaseOtherVersions = resolve; });
      // Deliberately replay an old document's response for the new selection.
      result = published ? [version()] : [];
    }
    if (action === "save") { content = b.content; documentId = b.id; revision++; result = draft(); }
    if (action === "publish") { published = true; publishedContent = structuredClone(content!); result = version(); }
    if (action === "prepare-share") {
      expect(b.documentId).toBe(documentId); expect(b.documentVersionId).toBe(versionId);
      prepareInputs.push(b); prepared = true;
      if (failPrepare) { failPrepare = false; return route.fulfill({ status: 503, json: { message: "합성 링크 응답 유실. 같은 요청으로 다시 시도해 주세요." } }); }
      result = { shareLinkId, sendId: null, documentId, documentVersionId: versionId, publicUrl, expiresAt: "2099-01-01T00:00:00Z", deliveryRecorded: false };
    }
    if (action === "record-send") {
      expect(b.documentId).toBeUndefined(); expect(prepared).toBe(true); expect(b.delivered).toBe(true); expect(b.shareLinkId).toBe(shareLinkId); sent = true; sendInputs.push(b);
      expect(b).toMatchObject({ documentVersionId: versionId, leadId, templateId: "pricing-doc-paper-v1", channel: "link" });
      expect(b.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
      const fingerprint = JSON.stringify(b);
      if (deliveryRecords.has(b.idempotencyKey)) expect(deliveryRecords.get(b.idempotencyKey)).toBe(fingerprint);
      deliveryRecords.set(b.idempotencyKey, fingerprint);
      contactRecords.set(b.idempotencyKey, sendId);
      if (failSend) { failSend = false; return route.fulfill({ status: 503, json: { message: "합성 전달 연결 응답 유실. 같은 요청으로 다시 시도해 주세요." } }); }
      result = { sendId, leadActionId: sendId, documentId, documentVersionId: versionId, publicUrl };
    }
    if (action === "revoke-share") { revoked = true; result = { shareLinkId, revoked: true }; }
    expect(url.pathname).not.toContain("store");
    return route.fulfill({ json: { result, manager: true } });
  });
  const publicHandler = async (route: Route) => {
    expect(route.request().method()).toBe("POST"); expect(route.request().postDataJSON()).toEqual({ token });
    expect(new URL(route.request().url()).search).toBe("");
    if (revoked) return route.fulfill({ status: 404, json: { message: "공유 문서를 사용할 수 없습니다." } });
    if (readError) return route.fulfill({ status: 503, json: { message: "합성 열람 확인 실패. 다시 시도해 주세요." } });
    const v = version();
    if (expiredPrice) v.content = { ...v.content, validUntil: "2020-01-01" };
    return route.fulfill({ json: { document: publicDocumentOutput(v), expiresAt: linkExpiresAt } });
  };
  await page.route("**/api/pricing-documents/public", publicHandler);
  await page.goto(`/revenue/pricing/documents?start=${kind}&leadId=${leadId}`);
  await expect.poll(() => profileRead).toBe(true);
  await page.getByRole("dialog", { name: "새 문서 시작", exact: true }).getByRole("button", { name: new RegExp(`빈 ${kind === "sheet" ? "단가표" : "견적서"}로 시작`) }).click();
  await page.getByRole("button", { name: /합성 공개 품목.*담기/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초안을 저장했습니다");
  await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
  const frozenVersion = JSON.stringify(version());
  // Keep the production guard: lead context cannot issue customer order QR links.
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: content!.title, exact: true }).click();
  await expect(page.getByRole("region", { name: "리드 문서 공유", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  const preview = page.getByRole("dialog", { name: "미리보기", exact: true });
  await preview.getByRole("button", { name: "주문 링크 QR 만들기", exact: true }).click();
  await preview.getByRole("combobox", { name: "QR을 받을 거래처", exact: true }).selectOption(customerId);
  await preview.getByRole("button", { name: "선택 거래처 QR 생성", exact: true }).click();
  await preview.getByRole("button", { name: "문서에 QR 넣기", exact: true }).click();
  await expect(preview.locator(".pricing-paper").first().getByRole("img", { name: "합성 QR 매장 주문 링크 QR", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "PDF·인쇄", exact: true }).click();
  await expect.poll(() => printed).toBe(1);
  const qrDownload = page.waitForEvent("download");
  await preview.getByRole("button", { name: "QR PNG 저장", exact: true }).click();
  expect((await qrDownload).suggestedFilename()).toBe("order-qr-v1.png");
  expect(orderLinks).toBe(1); expect(deliveryRecords.size).toBe(0); expect(contactRecords.size).toBe(0);
  expect(JSON.stringify(version())).toBe(frozenVersion);
  await page.screenshot({ path: info.outputPath(`stage-b-print-qr-${kind}-${width}.png`), fullPage: true });
  await preview.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto(`/revenue/pricing/documents?leadId=${leadId}`);
  await page.getByRole("button", { name: content!.title, exact: true }).click();
  const share = page.getByRole("region", { name: "리드 문서 공유", exact: true });
  await expect(share).toBeVisible(); expect(sent).toBe(false);
  await share.getByRole("button", { name: "링크 준비", exact: true }).click();
  await expect(share.getByRole("alert")).toContainText("합성 링크 응답 유실");
  await share.getByRole("button", { name: "링크 준비", exact: true }).click();
  await expect(share.getByRole("status")).toContainText("아직 전달 기록은 없습니다");
  expect(prepareInputs).toHaveLength(2); expect(prepareInputs[0]).toEqual(prepareInputs[1]); expect(sent).toBe(false);
  await expect(share.getByRole("button", { name: "실제 전달 완료 기록", exact: true })).toBeDisabled();
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }); });
  await share.getByRole("button", { name: "링크 복사", exact: true }).click();
  expect(sent).toBe(false);
  const viewerContext = await browser.newContext({ viewport: { width, height: 900 } });
  const viewer = await viewerContext.newPage();
  await viewer.route("**/api/pricing-documents/public", publicHandler);
  await viewer.clock.install({ time: new Date("2026-11-08T00:00:00Z") });
  await viewer.goto(new URL(publicUrl, page.url()).href);
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toBeVisible();
  await expect(viewer.getByText("1,000원", { exact: true })).toBeVisible();
  expect(deliveryRecords.size).toBe(0); expect(contactRecords.size).toBe(0);
  await share.getByRole("checkbox").check();
  await share.getByRole("button", { name: "실제 전달 완료 기록", exact: true }).click();
  await expect(share.getByRole("alert")).toContainText("합성 전달 연결 응답 유실");
  await share.getByRole("button", { name: "실제 전달 완료 기록", exact: true }).click();
  await expect(share.getByRole("status")).toContainText("실제 전달 기록을 확인했습니다");
  await expect(page.getByText(/작성·게시만 완료됐으며 리드에게 전달하지 않았습니다/)).toHaveCount(0);
  expect(sendInputs).toHaveLength(2); expect(sendInputs[0]).toEqual(sendInputs[1]); expect(sendInputs[0].idempotencyKey).toBe(prepareInputs[0].idempotencyKey);
  expect(deliveryRecords.size).toBe(1); expect(contactRecords.size).toBe(1);
  expect(contactRecords.get(String(sendInputs[0].idempotencyKey))).toBe(sendId);
  expect(JSON.stringify(version())).toBe(frozenVersion);
  for (const b of [...prepareInputs, ...sendInputs]) { expect(b).not.toHaveProperty("publicUrl"); expect(b).not.toHaveProperty("companyId"); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`lead-share-${kind}-${width}.png`), fullPage: true });
  await viewer.reload();
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toBeVisible();
  await expect(viewer.getByText("1,000원", { exact: true })).toBeVisible();
  await expect(viewer.getByText(/^18L\s*(?:·\s*)?통$/)).toBeVisible();
  await expect(viewer.getByText(/PRIVATE-|CANARY/)).toHaveCount(0);
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  expect((await viewer.getByRole("button", { name: "다시 확인", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await viewer.screenshot({ path: info.outputPath(`public-${kind}-${width}.png`), fullPage: true });
  readError = true; await viewer.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(viewer.getByRole("status")).toContainText("합성 열람 확인 실패"); await expect(viewer.getByText("1,000원", { exact: true })).toHaveCount(0);
  readError = false; linkExpiresAt = "2026-11-08T00:01:00Z";
  await viewer.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(viewer.getByText("1,000원", { exact: true })).toBeVisible();
  await viewer.clock.fastForward(61_000);
  await expect(viewer.getByRole("status")).toContainText("유효기간을 다시 확인");
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toHaveCount(0);
  await expect(viewer.getByText("1,000원", { exact: true })).toHaveCount(0);
  linkExpiresAt = "2099-01-01T00:00:00Z"; expiredPrice = true; await viewer.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(viewer.getByText("유효기간이 지나 가격을 표시하지 않습니다.", { exact: true })).toBeVisible();
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toBeVisible(); await expect(viewer.getByText("1,000원", { exact: true })).toHaveCount(0);
  await share.getByRole("button", { name: "링크 회수", exact: true }).click();
  await expect(share.getByRole("status")).toContainText("링크를 회수했습니다");
  expect(revoked).toBe(true);
  await viewer.reload(); await expect(viewer.getByRole("status")).toContainText("공유 문서를 사용할 수 없습니다");
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toHaveCount(0);
  await viewerContext.close();
  const prepareCount = prepareInputs.length;
  await page.getByRole("button", { name: "← 문서 목록", exact: true }).click();
  await page.getByRole("button", { name: "합성 다른 문서", exact: true }).click();
  await expect.poll(() => Boolean(releaseOtherVersions)).toBe(true);
  await expect(page.getByRole("button", { name: "링크 준비", exact: true })).toHaveCount(0);
  releaseOtherVersions!();
  await expect(page.getByRole("button", { name: "초안 저장", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "리드 문서 공유", exact: true })).toHaveCount(0);
  expect(prepareInputs).toHaveLength(prepareCount);
  await page.route(`**/api/leads/permits/${leadId}/actions*`, route => route.fulfill({ json: { actions: Array.from(contactRecords.values()).map(id => ({
    id, actionType: kind === "quote" ? "quote" : "dm", result: kind === "quote" ? "견적 전달" : "단가표 전달",
    memo: "게시 문서 링크 전달", actorName: "합성 담당", createdAt: "2026-11-06T00:00:00Z",
  })) } }));
  await page.goto(`/leads/${leadId}`);
  await page.getByRole("tab", { name: "영업 기록", exact: true }).click();
  const history = page.getByRole("tabpanel", { name: "영업 기록", exact: true });
  await expect(history.getByText(kind === "quote" ? "견적 전달" : "단가표 전달", { exact: true })).toHaveCount(1);
  await expect(history).toContainText("합성 담당");
  await page.screenshot({ path: info.outputPath(`lead-contact-${kind}-${width}.png`), fullPage: true });

});
