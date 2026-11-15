import { expect, test } from "@playwright/test";

test("리드 상세은 팝업 없이 문구 바로 아래 채널 표와 서식된 문의 번호를 보여 준다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const now = "2026-11-15T00:00:00.000Z";
  const lead = {
    id: "30000000-0000-4000-8000-000000000014",
    businessName: "가짜분식",
    address: "서울 가짜구 가짜로 14",
    phone: "01000000000",
    email: "owner@example.test",
    fax: "020000000",
    isActive: true,
    leadPeriod: "old",
    industryPrimary: "한식",
    industryTags: [],
    isTargetIndustry: true,
    isTemporaryOperation: false,
    isTemporaryOperationSuspected: false,
    isDuplicate: false,
    status: "신규",
    nextActionReasons: [],
    scoreTotal: 50,
    scoreBreakdown: {},
    grade: "B",
    createdAt: now,
    updatedAt: now
  };
  let acknowledge: (() => void) | undefined;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; } } });
  });
  await page.route(/\/api\/leads\/permits\?excludeExcluded=true/, (route) => route.fulfill({ json: { leads: [lead] } }));
  await page.route(/\/api\/leads\/permits\/[^/]+\/actions/, (route) => route.fulfill({ json: { actions: [] } }));
  await page.route(/\/api\/leads\/permits\/[^/]+\/(?:do-not-contact|source-disclosure)/, (route) => route.fulfill({ json: route.request().url().includes("do-not-contact") ? { enabled: false, entries: [] } : { sources: [] } }));
  await page.route(/\/api\/leads\/dm-template/, (route) => route.fulfill({ json: { canEdit: false, excluded: "", template: "안녕하세요. 가짜 제안입니다." } }));
  await page.route(/\/api\/sales-kpi/, (route) => route.fulfill({ json: {} }));
  await page.route(/\/api\/sales-kit(?:\?|$)/, (route) => route.fulfill({ json: {
    canEdit: true,
    kit: { contactLabel: "가짜유통", contactPhone: "01000000000", defaults: {}, fields: ["contact"], materials: [], orderCode: "", orderUrl: "" },
    lines: [{ field: "contact", label: "문의", text: "▶ 문의 가짜유통 010-0000-0000" }]
  } }));
  await page.route(/\/api\/leads\/outreach-policy/, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: { acknowledged: true } });
    await new Promise<void>((resolve) => { acknowledge = resolve; });
    return route.fulfill({ json: { acknowledged: false } });
  });

  await page.goto("/mobile/sales");
  await page.getByText("가짜분식", { exact: true }).last().click();
  const panel = page.getByRole("region", { name: "영업 채널" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog", { name: "영업 연락 수칙" })).toHaveCount(0);
  acknowledge?.();
  await expect(panel.getByText("영업 연락 수칙을 확인해 주세요", { exact: true })).toBeVisible();
  const messageBox = panel.getByRole("textbox", { name: "보낼 문구" });
  const channelTable = panel.locator('[aria-label="영업 채널 표"]');
  expect((await channelTable.boundingBox())!.y).toBeGreaterThan((await messageBox.boundingBox())!.y);
  await panel.getByRole("button", { name: "수칙 보기·확인" }).click();
  await panel.getByRole("button", { name: "확인하고 영업 시작" }).click();
  await panel.getByRole("button", { name: "문구 복사", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toContain("▶ 문의 가짜유통 010-0000-0000");
});
