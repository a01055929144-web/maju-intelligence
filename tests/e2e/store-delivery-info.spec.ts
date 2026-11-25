import { expect, test, type Page } from "@playwright/test";

// CX-152: 점주가 배송 정보를 넣어야 배송된다 — 카드·버튼 비활성·입력 시트·저장 막힘·고객사 화면 비밀번호 비노출. 서버 응답은 합성 데이터.
const companyId = "00000000-0000-4000-8000-000000000001", storeAccountId = "20000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000001";
const SECRET = "synthetic-secret-pw-77";
const labels: Record<string, string> = { baseAddress: "배송 주소", addressDetail: "상세 주소", receiveMethod: "받는 방법", accessNote: "적치 위치", deliveryContactPhone: "배송 연락처", accessPassword: "출입 비밀번호" };

async function mockStore(page: Page, state: { missing: string[]; saved: Array<Record<string, unknown>>; profile: boolean }) {
  await page.route("**/api/storefront", (route) => {
    if (route.request().method() === "PUT") return route.fulfill({ json: { result: { id: "o1", revision: 1 } } });
    const eligible = state.missing.length === 0;
    return route.fulfill({ json: { store: { title: "합성 단가표", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: "서울 중구 합성로 1", version: 1, validUntil: "2099-12-31",
      priceAvailable: true, canOrder: eligible, nextDeliveryDate: "2099-01-05", selectedDeliveryDate: "2099-01-05", notice: "", marketPriceNotice: "",
      deliveryInfo: { missing: state.missing.map((key) => ({ key, label: labels[key] })) },
      policy: { weekdays: [1, 3], holidays: [], cutoffDaysBefore: 1, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 },
      lines: [{ key: `${productId}:`, productId, promotionId: null, name: "합성 품목", category: "", brand: "", spec: "1kg", unit: "봉", badge: "", taxType: "exempt", unitPrice: 1000, priceIncludesTax: false, isMarketPrice: false, remaining: null, maximumQuantity: null, recentDispatchPrice: null, recentDispatchDate: null }] },
    deliveryEdit: { companyId, storeAccountId }, orders: [], preferences: [], historyPage: 1, historyHasMore: false } });
  });
  await page.route("**/api/store/delivery-info**", (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>; state.saved.push(body);
      state.missing = []; return route.fulfill({ json: { saved: true } });
    }
    if (url.searchParams.has("query")) return route.fulfill({ json: { results: [{ address: "서울 중구 세종대로 110", selectionProof: "synthetic-proof" }] } });
    return route.fulfill({ json: { baseAddress: "서울 중구 합성로 1", addressDetail: "", accessNote: "", deliveryContactPhone: "", receiveMethod: "", hasAccessPassword: false, hasProfile: state.profile,
      required: { profile: state.profile, receiveMethod: state.profile }, missing: [] } });
  });
}

for (const width of [1440, 390]) {
  test(`상세 주소 없음: 카드·주문 버튼 비활성 → 입력하면 주문 가능 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = { missing: ["addressDetail"], saved: [] as Array<Record<string, unknown>>, profile: false };
    await mockStore(page, state);
    await page.goto("/store#synthetic-token");
    await page.getByRole("button", { name: "주문하기", exact: true }).click();
    if (width === 1440) await page.getByRole("button", { name: "격자형", exact: true }).click();
    const card = page.getByRole("region", { name: "배송 정보 입력 안내" });
    await expect(card).toContainText("배송 정보를 넣어야 배송됩니다");
    await expect(card).toContainText("상세 주소");
    await page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true }).click();
    await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeDisabled();
    await expect(page.getByTestId("submit-disabled-reason")).toContainText("배송 정보를 먼저 입력해 주세요");
    await page.getByRole("button", { name: "배송 정보 먼저 입력" }).click();
    const sheet = page.getByRole("dialog", { name: "배송 정보 입력" });
    await expect(sheet.getByRole("button", { name: "배송 정보 저장" })).toBeDisabled();
    await expect(sheet.getByTestId("delivery-info-missing")).toContainText("상세 주소");
    await sheet.getByLabel("상세 주소").fill("2층");
    await sheet.getByRole("button", { name: "배송 정보 저장" }).click();
    await expect.poll(() => state.saved.length).toBe(1);
    expect(state.saved[0]).toMatchObject({ addressDetail: "2층" });
    await expect(page.getByRole("region", { name: "배송 정보 입력 안내" })).toHaveCount(0);
    await page.getByRole("button", { name: "합성 품목 수량 늘리기", exact: true }).click().catch(() => undefined);
    await expect(page.getByRole("button", { name: "후결제로 주문 신청", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test(`새벽 배송 + 비밀번호 없음은 저장이 막히고, 비밀번호는 입력란에서만 다룬다 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = { missing: ["receiveMethod", "accessNote", "deliveryContactPhone", "addressDetail"], saved: [] as Array<Record<string, unknown>>, profile: true };
    await mockStore(page, state);
    await page.goto("/store#synthetic-token");
    await page.getByRole("button", { name: "배송 정보 입력", exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "배송 정보 입력" });
    await sheet.getByLabel("상세 주소").fill("2층");
    await sheet.getByLabel("받는 방법").selectOption("dawn");
    await sheet.getByLabel("적치 위치").fill("후문 냉장고 앞");
    await sheet.getByLabel("배송 연락처").fill("010-1234-5678");
    const save = sheet.getByRole("button", { name: "배송 정보 저장" });
    await expect(save).toBeDisabled();
    await expect(sheet.getByTestId("delivery-info-missing")).toContainText("출입 비밀번호");
    const password = sheet.getByLabel("출입 비밀번호");
    await expect(password).toHaveAttribute("type", "password");
    await password.fill(SECRET);
    await expect(save).toBeEnabled();
    await expect(page.getByText(SECRET)).toHaveCount(0); // 화면 글자로는 어디에도 나오지 않는다
    await save.click();
    await expect.poll(() => state.saved.length).toBe(1);
    expect(state.saved[0]).toMatchObject({ receiveMethod: "dawn", accessNote: "후문 냉장고 앞", accessPassword: SECRET });
  });
}
