import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 900 }, { width: 1440, height: 1000 }]) {
test(`리드 상세 연락 채널은 ${viewport.width}px에서 하단 영업 채널과 연결된다`, async ({ page }) => {
  await page.setViewportSize(viewport);
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
    kit: { contactLabel: "가짜유통", contactPhone: "01000000000", defaults: {}, fields: ["contact"], materials: [], orderCode: "", orderUrl: "", priceSheetUrl: "" },
    lines: [{ field: "contact", label: "문의", text: "▶ 문의 가짜유통 010-0000-0000" }]
  } }));
  await page.route(/\/api\/sales-kit\/price-sheet-links/, (route) => route.fulfill({ json: { links: [{
    id: "60000000-0000-4000-8000-000000000014",
    title: "가짜 11월 단가표",
    publishedAt: now,
    url: "https://example.test/pricing-document#fake-token"
  }] } }));
  await page.route(/\/api\/leads\/outreach-policy/, async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: { acknowledged: true } });
    await new Promise<void>((resolve) => { acknowledge = resolve; });
    return route.fulfill({ json: { acknowledged: false } });
  });

  await page.goto("/mobile/sales");
  await page.getByText("가짜분식", { exact: true }).last().click();
  const shortcuts = page.getByLabel("연락 채널 바로가기");
  for (const channel of ["방문", "연락처", "카톡", "인스타 DM", "네이버 톡톡", "이메일", "팩스"]) {
    await expect(shortcuts.getByRole("button", { name: new RegExp(`^${channel}`) })).toBeVisible();
  }
  await expect(shortcuts.getByRole("button", { name: /^네이버 톡톡.*\[입력\]/ })).toBeVisible();
  await shortcuts.getByRole("button", { name: /^네이버 톡톡/ }).click();
  const panel = page.getByRole("region", { name: "영업 채널" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "톡톡 주소" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "영업 연락 수칙" })).toHaveCount(0);
  acknowledge?.();
  await expect(panel.getByText("영업 연락 수칙을 확인해 주세요", { exact: true })).toBeVisible();
  const messageBox = panel.getByRole("textbox", { name: "보낼 문구" });
  const channelTable = panel.locator('[aria-label="영업 채널 표"]');
  expect((await channelTable.boundingBox())!.y).toBeGreaterThan((await messageBox.boundingBox())!.y);
  await panel.getByRole("button", { name: "수칙 보기·확인" }).click();
  await panel.getByRole("button", { name: "확인하고 영업 시작" }).click();
  await expect(panel.getByRole("combobox", { name: "발행한 단가표" })).toHaveValue("https://example.test/pricing-document#fake-token");
  for (const channel of ["문자", "카톡", "인스타 DM", "네이버 톡톡", "카페 댓글", "쪽지"]) {
    await expect(panel.locator('[aria-label="채널별 문구"]').getByText(channel, { exact: true })).toBeVisible();
  }
  await panel.getByRole("button", { name: "문구 복사", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toContain("▶ 문의 가짜유통 010-0000-0000");
  await expect.poll(() => page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toContain("▶ 단가표 https://example.test/pricing-document#fake-token");
});
}

// CC-47-9: 모바일 일괄 "제외"는 확인 창을 거친다 — 취소하면 요청이 없고, 확인하면 한 번 간다. 가짜 API만 쓴다.
test("모바일 일괄 제외는 확인 창에서 취소하면 그대로, 확인하면 요청한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const now = "2026-11-15T00:00:00.000Z";
  const lead = { id: "30000000-0000-4000-8000-000000000015", businessName: "가짜식당", address: "서울 가짜구 가짜로 15", phone: "01000000000", isActive: true, leadPeriod: "old", industryPrimary: "한식", industryTags: [], isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, status: "신규", nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now };
  const actions: string[] = [];
  await page.route(/\/api\/sales-kpi/, (route) => route.fulfill({ json: {} }));
  await page.route(/\/api\/leads\/permits\?excludeExcluded=true/, (route) => route.fulfill({ json: { leads: [lead] } }));
  await page.route(/\/api\/leads\/permits\/[^/?]+\/action$/, (route) => {
    actions.push(route.request().url());
    return route.fulfill({ json: { lead: { ...lead, status: "제외" } } });
  });
  await page.goto("/mobile/sales");
  await page.getByRole("button", { name: "일괄 변경" }).click();
  await page.getByText("가짜식당", { exact: true }).last().click();
  await page.getByRole("button", { name: "제외", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "확인" });
  await expect(dialog).toContainText("1개 리드를 제외 상태로 변경할까요?");
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
  expect(actions).toEqual([]);
  await page.getByRole("button", { name: "제외", exact: true }).click();
  await dialog.getByRole("button", { name: "제외", exact: true }).click();
  await expect.poll(() => actions.length).toBe(1);
});
