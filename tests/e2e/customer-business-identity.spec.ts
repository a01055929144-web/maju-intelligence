import { expect, test } from "@playwright/test";

// CC-70: 매출처 원장 수정 — 사업자 상호 · 종사업장번호 · 개인/법인 · 법인등록번호. 같은 사업자번호 + 종사업장번호가 다르면 저장 허용(안내), 같으면 저장 막고 중복 허용 링크. 가짜 API. 1440 · 390.
const base = { address: "서울 가짜구 가짜로 1", deliveryKm: 3, grade: "B", industry: "한식", lastOrderDays: 2, memoCount: 0, visitCount: 1, monthlyRevenue: 100, region: "서울", phone: "01000000000", representativeName: "가짜대표", businessNumber: "123-45-67890" };
const customers = [
  { ...base, id: "10000000-0000-4000-8000-0000000000a1", customerName: "합성 OO 본점", subBusinessNumber: "0001", businessName: "주식회사 합성OO", businessEntityType: "corporation" },
  { ...base, id: "10000000-0000-4000-8000-0000000000a2", customerName: "합성 OO 청담점", subBusinessNumber: "0002", businessName: "주식회사 합성OO", businessEntityType: "corporation" }
];

for (const width of [1440, 390]) test(`매출처 사업자 정보: 종사업장이 다르면 저장, 같으면 막힘 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const patches: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/customers(\?|$)/, (route) => {
    if (route.request().method() === "PATCH") { patches.push(route.request().postDataJSON()); return route.fulfill({ json: { customer: customers[1], source: "supabase" } }); }
    return route.fulfill({ json: { source: "supabase", truncated: false, customers } });
  });
  await page.goto(`/crm/timeline?section=ledger&customerId=${customers[1].id}`);
  const identity = page.getByRole("group", { name: "사업자 정보" });
  await expect(identity).toBeVisible();
  await expect(identity.getByLabel(/종사업장번호/)).toHaveValue("0002");
  await expect(identity.getByRole("status")).toContainText("합성 OO 본점");
  await identity.getByLabel(/사업자 상호/).fill("주식회사 합성OO 청담");
  const save = page.getByRole("button", { name: "변경 저장" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ businessName: "주식회사 합성OO 청담", subBusinessNumber: "0002", businessEntityType: "corporation" });
  await identity.getByLabel(/종사업장번호/).fill("0001");
  await expect(identity.getByRole("alert")).toContainText("저장할 수 없습니다");
  await expect(identity.getByRole("link", { name: "중복 허용 사업자번호에 추가" })).toBeVisible();
  await expect(save).toBeDisabled();
  await identity.getByLabel(/종사업장번호/).fill("12");
  await expect(identity.getByRole("alert").filter({ hasText: "숫자 4자리" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
