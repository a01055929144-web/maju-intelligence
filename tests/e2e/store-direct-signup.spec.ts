import { expect, test, type Page } from "@playwright/test";

// CX-11 직접 가입 화면(CI 전용 서버 픽스처: 세션·DB 없음). API는 page.route로 모킹한다.
// 실제 DB·회사 격리는 단위 테스트(라우트: 소유자는 세션 사용자)와 CX-10 PG17 테스트가 맡는다.
const address = { address: "서울 합성구 합성로 1", buildingName: "합성빌딩" };

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
}

for (const width of [1440, 1920, 390]) {
  test.describe(`store direct signup at ${width}px`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height: 900 }); });

    test("guest sees one heading and the Kakao start button", async ({ page }) => {
      await page.goto("/store?fixture=store-direct-signup-guest");
      await expect(page.getByRole("heading", { name: "MAJU 매장", exact: true })).toHaveCount(1);
      await expect(page.getByText("카카오로 시작하세요. 처음이면 매장 정보를 입력하고 바로 시작할 수 있어요.")).toBeVisible();
      const start = page.getByRole("link", { name: "카카오로 시작", exact: true });
      await expect(start).toHaveAttribute("href", "/api/auth/kakao/start?storePortal=1");
      expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await noOverflow(page);
    });

    test("new owner enters store info and the profile request carries only form fields", async ({ page }) => {
      let body: Record<string, unknown> | null = null;
      await page.route("**/api/address-search**", (route) => route.fulfill({ json: { results: [address] } }));
      await page.route("**/api/store/profile", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        body = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: { storeProfileId: "00000000-0000-4000-8000-0000000000f1" } });
      });
      await page.goto("/store?fixture=store-direct-signup-new");
      await expect(page.getByRole("heading", { name: "MAJU 매장", exact: true })).toHaveCount(1);
      const submit = page.getByRole("button", { name: "매장 등록하기", exact: true });
      await expect(submit).toBeDisabled();

      await page.getByLabel("매장 이름", { exact: true }).fill("합성 식당");
      await page.getByRole("checkbox", { name: /개업 예정/ }).check();
      await expect(page.getByLabel("사업자등록번호", { exact: true })).toBeDisabled();
      await page.getByLabel("매장 주소", { exact: true }).fill("합성로");
      await page.getByRole("button", { name: "검색", exact: true }).click();
      await page.getByRole("button", { name: "서울 합성구 합성로 1 · 합성빌딩", exact: true }).click();
      await expect(page.getByText("선택한 주소:")).toBeVisible();
      await page.getByLabel("상세 주소", { exact: true }).fill("2층");
      await expect(submit).toBeEnabled();
      expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await noOverflow(page);
      await page.screenshot({ fullPage: true, path: test.info().outputPath(`direct-signup-form-${width}.png`) });

      await page.getByRole("checkbox", { name: /이용 약관에 동의/ }).check();
      await submit.click();
      await expect.poll(() => body).not.toBeNull();
      expect(body).toEqual({ storeName: "합성 식당", openingSoon: true, businessNumber: "", baseAddress: address.address, addressDetail: "2층", termsAccepted: true });
      // 가입 주체는 서버 세션이 정한다. 화면은 사용자 ID를 보내지 않는다.
      expect(Object.keys(body!).join(",")).not.toMatch(/user|auth|company|owner/i);
    });

    test("a rejected business number shows the server message and keeps the form", async ({ page }) => {
      let calls = 0;
      await page.route("**/api/address-search**", (route) => route.fulfill({ json: { results: [address] } }));
      await page.route("**/api/store/profile", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        calls += 1;
        return calls === 1
          ? route.fulfill({ status: 400, json: { field: "businessNumber", message: "사업자등록번호 10자리를 확인해 주세요. 아직 없으면 '개업 예정'을 선택하세요." } })
          : route.fulfill({ status: 201, json: { storeProfileId: "00000000-0000-4000-8000-0000000000f1" } });
      });
      await page.goto("/store?fixture=store-direct-signup-new");
      await page.getByLabel("매장 이름", { exact: true }).fill("합성 식당");
      await page.getByLabel("사업자등록번호", { exact: true }).fill("123-45-67890");
      await page.getByLabel("매장 주소", { exact: true }).fill("합성로");
      await page.getByRole("button", { name: "검색", exact: true }).click();
      await page.getByRole("button", { name: "서울 합성구 합성로 1 · 합성빌딩", exact: true }).click();
      await page.getByRole("checkbox", { name: /이용 약관에 동의/ }).check();
      await page.getByRole("button", { name: "매장 등록하기", exact: true }).click();
      await expect(page.getByRole("form", { name: "매장 정보 입력" }).getByRole("alert")).toContainText("사업자등록번호 10자리를 확인해 주세요");
      await expect(page.getByLabel("매장 이름", { exact: true })).toHaveValue("합성 식당");
      await noOverflow(page);
      await page.getByRole("checkbox", { name: /개업 예정/ }).check();
      await page.getByRole("button", { name: "매장 등록하기", exact: true }).click();
      await expect.poll(() => calls).toBe(2);
    });

    test("after signup the home shows the store and that no distributor is linked yet", async ({ page }) => {
      await page.goto("/store?fixture=store-direct-signup-profile");
      await expect(page.getByRole("heading", { name: "MAJU 매장", exact: true })).toHaveCount(1);
      await expect(page.getByText("합성 가입 식당", { exact: true })).toBeVisible();
      await expect(page.getByText("개업 예정 · 서울 합성구 합성로 1")).toBeVisible();
      await expect(page.getByRole("status")).toContainText("아직 연결된 유통사가 없습니다");
      // 직접 가입 홈에는 다른 유통사·회사 목록이 없다(영업권 보호).
      await expect(page.getByRole("list")).toHaveCount(0);
      await noOverflow(page);
    });
  });
}
