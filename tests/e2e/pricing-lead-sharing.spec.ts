import { expect, test, type Route } from "@playwright/test";
import { publicDocumentOutput } from "../../domains/pricing/document-share";
import type { DocumentContent, DocumentVersion } from "../../domains/pricing/document";

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) test(`lead ${kind} prepare, explicit delivery and public read at ${width}px`, async ({ page }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const leadId = "20000000-0000-4000-8000-000000000001", versionId = "40000000-0000-4000-8000-000000000001";
  const shareLinkId = "50000000-0000-4000-8000-000000000001", sendId = "60000000-0000-4000-8000-000000000001";
  const product = { id: "30000000-0000-4000-8000-000000000001", name: "합성 공개 품목", displayName: "합성 공개 품목", brand: "합성 브랜드", spec: "18L", unit: "통", price: 1000, taxType: "exempt" };
  let content: DocumentContent | undefined, documentId = "", revision = 0, published = false, profileRead = false;
  let failPrepare = true, failSend = true, prepared = false, sent = false, revoked = false, readError = false, expiredPrice = false;
  const prepareInputs: Record<string, unknown>[] = [], sendInputs: Record<string, unknown>[] = [];
  const token = "synthetic-purpose-signed-token", publicUrl = `/pricing-document#${token}`;
  const draft = () => ({ id: documentId, revision, content, updatedAt: "2026-11-06T00:00:00Z" });
  const version = (): DocumentVersion => ({ id: versionId, documentId, version: 1, revision, content: content!, publishedAt: "2026-11-06T00:00:00Z", unavailablePromotions: [] });
  await page.route(/\/api\/pricing-documents(?:\/catalog-index)?(?:\?.*)?$/, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const b = request.method() === "POST" ? request.postDataJSON() : {};
    const action = b.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: content ? [draft()] : [], total: content ? 1 : 0 };
    if (action === "profile") { profileRead = true; result = { revision: 0, content: { companyName: "합성 유통", contact: "PRIVATE-CONTACT-CANARY", footer: "PRIVATE-FOOTER-CANARY" } }; }
    if (action === "catalog") result = { items: [product], total: 1 };
    if (action === "versions") result = published ? [version()] : [];
    if (action === "save") { content = b.content; documentId = b.id; revision++; result = draft(); }
    if (action === "publish") { published = true; result = version(); }
    if (action === "prepare-share") {
      prepareInputs.push(b); prepared = true;
      if (failPrepare) { failPrepare = false; return route.fulfill({ status: 503, json: { message: "합성 링크 응답 유실. 같은 요청으로 다시 시도해 주세요." } }); }
      result = { shareLinkId, sendId: null, documentId, documentVersionId: versionId, publicUrl, expiresAt: "2099-01-01T00:00:00Z", deliveryRecorded: false };
    }
    if (action === "record-send") {
      expect(prepared).toBe(true); expect(b.delivered).toBe(true); expect(b.shareLinkId).toBe(shareLinkId); sent = true; sendInputs.push(b);
      if (failSend) { failSend = false; return route.fulfill({ status: 503, json: { message: "합성 전달 연결 응답 유실. 같은 요청으로 다시 시도해 주세요." } }); }
      result = { sendId, documentId, documentVersionId: versionId, publicUrl };
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
    return route.fulfill({ json: { document: publicDocumentOutput(v), expiresAt: "2099-01-01T00:00:00Z" } });
  };
  await page.route("**/api/pricing-documents/public", publicHandler);
  await page.goto(`/revenue/pricing/documents?start=${kind}&leadId=${leadId}`);
  await expect.poll(() => profileRead).toBe(true);
  await page.getByRole("dialog", { name: "새 문서 시작", exact: true }).getByRole("button", { name: new RegExp(`빈 ${kind === "sheet" ? "단가표" : "견적서"}로 시작`) }).click();
  await page.getByRole("button", { name: /합성 공개 품목.*담기/ }).click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("초안을 저장했습니다");
  await page.getByRole("button", { name: "판매가 버전 확정", exact: true }).click();
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
  await share.getByRole("checkbox").check();
  await share.getByRole("button", { name: "실제 전달 완료 기록", exact: true }).click();
  await expect(share.getByRole("alert")).toContainText("합성 전달 연결 응답 유실");
  await share.getByRole("button", { name: "실제 전달 완료 기록", exact: true }).click();
  await expect(share.getByRole("status")).toContainText("실제 전달 기록을 확인했습니다");
  expect(sendInputs).toHaveLength(2); expect(sendInputs[0]).toEqual(sendInputs[1]); expect(sendInputs[0].idempotencyKey).toBe(prepareInputs[0].idempotencyKey);
  for (const b of [...prepareInputs, ...sendInputs]) { expect(b).not.toHaveProperty("publicUrl"); expect(b).not.toHaveProperty("companyId"); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`lead-share-${kind}-${width}.png`), fullPage: true });
  const viewer = await page.context().newPage();
  await viewer.setViewportSize({ width, height: 900 });
  await viewer.route("**/api/pricing-documents/public", publicHandler);
  await viewer.goto(new URL(publicUrl, page.url()).href);
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toBeVisible();
  await expect(viewer.getByText("1,000원", { exact: true })).toBeVisible();
  await expect(viewer.getByText("18L · 통", { exact: true })).toBeVisible();
  await expect(viewer.getByText(/PRIVATE-|CANARY/)).toHaveCount(0);
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  expect((await viewer.getByRole("button", { name: "다시 확인", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await viewer.screenshot({ path: info.outputPath(`public-${kind}-${width}.png`), fullPage: true });
  readError = true; await viewer.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(viewer.getByRole("status")).toContainText("합성 열람 확인 실패"); await expect(viewer.getByText("1,000원", { exact: true })).toHaveCount(0);
  readError = false; expiredPrice = true; await viewer.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(viewer.getByText("유효기간이 지나 가격을 표시하지 않습니다.", { exact: true })).toBeVisible();
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toBeVisible(); await expect(viewer.getByText("1,000원", { exact: true })).toHaveCount(0);
  await share.getByRole("button", { name: "링크 회수", exact: true }).click();
  await expect(share.getByRole("status")).toContainText("링크를 회수했습니다");
  expect(revoked).toBe(true);
  await viewer.reload(); await expect(viewer.getByRole("status")).toContainText("공유 문서를 사용할 수 없습니다");
  await expect(viewer.getByText("합성 공개 품목", { exact: true })).toHaveCount(0);
  await viewer.close();
});
