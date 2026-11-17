import { expect, test } from "@playwright/test";

// CC-73: 매출처 · 매입처가 같은 틀. 매출처 통합 화면: 목록 → 상세 → 전표 → 원장(가짜 원장 API). 매입처는 같은 위쪽 버튼 · 같은 목록 틀. 1440 · 390.
for (const width of [1440, 390]) {
  test(`매출처 통합 화면: 목록 → 상세 → 전표 → 원장 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    const writes: Array<Record<string, unknown>> = [];
    await page.route(/\/api\/partner-ledger/, (route) => {
      if (route.request().method() === "POST") { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { entry: { id: `write-${writes.length}` } } }); }
      return route.fulfill({ json: { openingBalance: 0, closingBalance: 329000, paymentEnabled: true, documents: [{ id: "d1", document_number: "S-2026-001", document_date: "2026-11-10", total_amount: 330000 }], entries: [
        { id: "e1", entry_date: "2026-11-10", entry_type: "sale", amount: 330000, runningBalance: 330000, memo: "합성 매출", payment_method: null, source_document_id: "d1", reverses_entry_id: null },
        { id: "e2", entry_date: "2026-11-11", entry_type: "receipt", amount: -1000, runningBalance: 329000, memo: "합성 입금", payment_method: "bank", source_document_id: null, reverses_entry_id: null }
      ] } });
    });
    const base = { address: "서울 가짜구 가짜로 1", deliveryKm: 3, grade: "B", industry: "한식", lastOrderDays: 2, memoCount: 1, visitCount: 3, monthlyRevenue: 120, region: "서울", phone: "01000000000", representativeName: "가짜대표", businessNumber: "1234567890" };
    await page.route(/\/api\/customers(\?|$)/, (route) => route.fulfill({ json: { source: "supabase", truncated: false, customers: [
      { ...base, id: "10000000-0000-4000-8000-000000000001", customerName: "합성거래처 01" },
      { ...base, id: "10000000-0000-4000-8000-000000000002", customerName: "합성거래처 02" }
    ] } }));
    await page.goto("/crm/timeline?section=partners");
    const toolbar = page.getByRole("toolbar", { name: "매출처 작업" });
    await expect(toolbar).toBeVisible();
    for (const name of ["등록", "엑셀 올리기", "전표 쓰기"]) await expect(toolbar.getByText(name)).toBeVisible();
    const list = page.getByRole("region", { name: "매출처 목록" });
    await expect(list).toBeVisible();
    const detail = page.getByRole("region", { name: "매출처 상세" });
    await list.getByRole("button", { name: /^합성거래처 02/ }).first().click();
    await expect(detail).toContainText("합성거래처 02");
    await detail.getByRole("tab", { name: "전표" }).click();
    await expect(detail.getByRole("link", { name: "전표 화면 열기" })).toHaveAttribute("href", /partnerType=customer&partnerId=/);
    await detail.getByRole("tab", { name: "원장" }).click();
    await expect(detail).toContainText("현재 미수금");
    await expect(detail).toContainText("합성 매출");
    await detail.getByLabel("입출금 금액").fill("50000");
    await detail.getByLabel("입출금 수단").selectOption("card");
    await detail.getByLabel("연결 전표").selectOption("d1");
    await detail.getByLabel("입출금 메모").fill("합성 카드 입금");
    await detail.getByRole("button", { name: "입금 등록" }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual(expect.objectContaining({ action: "record", amount: 50000, paymentMethod: "card", documentId: "d1", memo: "합성 카드 입금" }));
    page.once("dialog", (dialog) => dialog.accept("합성 입금 취소"));
    await detail.getByRole("button", { name: "취소" }).click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1]).toEqual(expect.objectContaining({ action: "reverse", entryId: "e2", reason: "합성 입금 취소" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
  test(`매입처 화면도 같은 틀·같은 위쪽 버튼 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
    await page.goto("/purchasing/suppliers");
    const toolbar = page.getByRole("toolbar", { name: "매입처 작업" });
    await expect(toolbar).toBeVisible();
    for (const name of ["등록", "엑셀 올리기", "전표 쓰기"]) await expect(toolbar.getByText(name)).toBeVisible();
    await expect(page.getByRole("region", { name: "매입처 목록" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
