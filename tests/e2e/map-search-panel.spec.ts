import { expect, test } from "@playwright/test";

// CC-42b / M2a: 검색 결과가 떠 있는 목록이 아니라 오른쪽 패널(390은 지도 아래)에 묶음으로 나온다.
// 검색 → 묶음 확인 → 등록(단건 열기·일괄) → Esc/×로 원래 패널 복귀.
// M2b: 줄 번호(지도 번호 핀과 같은 번호) · `결과 전체 보기`. 지도 위 배지·강조·화면 맞춤은 카카오 SDK가 필요해 CI에서는 못 본다.
const lead = (n: number, name: string, period: "old" | "new") => ({
  openDate: period === "new" ? new Date().toISOString().slice(0, 10) : "2020-01-01",
  id: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`, businessName: name, isActive: true, address: `서울 중구 ${name}`, latitude: 37.56, longitude: 126.98,
  leadPeriod: period, industryPrimary: "한식", industryTags: [], isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false,
  isDuplicate: false, status: "신규", nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B",
});
const external = [
  { name: "합성 미등록 식당 1", address: "서울 중구 가짜로 1", roadAddress: "서울 중구 가짜로 1", industry: "한식", phone: "", kakaoPlaceUrl: "https://place.map.kakao.com/1" },
  { name: "합성 미등록 식당 2", address: "서울 중구 가짜로 2", roadAddress: "서울 중구 가짜로 2", industry: "분식", phone: "", kakaoPlaceUrl: "https://place.map.kakao.com/2" },
];

for (const width of [1440, 390]) test(`지도 검색 결과 패널: 검색·묶음·일괄 등록·Esc 복귀 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: { leads: [lead(1, "합성 영업 가게", "old"), lead(2, "합성 신규 가게", "new")], salesRegionsConfigured: true } }));
  const searches: string[] = [];
  await page.route(/\/api\/business-search\?/, (route) => { searches.push(new URL(route.request().url()).searchParams.get("query") || ""); return route.fulfill({ json: { results: external } }); });
  const registered: string[] = [];
  await page.route("**/api/customers", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    registered.push((route.request().postDataJSON() as { customerName: string }).customerName);
    return route.fulfill({ json: { customer: { id: `c-${registered.length}` } } });
  });
  await page.goto("/map");

  if (width < 640) await page.getByRole("button", { name: "필터", exact: true }).click(); // 휴대폰은 검색창이 필터 줄 안에 접혀 있다
  const search = page.getByPlaceholder("상호·주소·전화");
  await search.fill("합성");
  const panel = page.getByRole("region", { name: "검색 결과" });
  await expect(panel).toBeVisible();
  // 묶음 제목(떠 있는 드롭다운은 없다)
  await expect(panel.getByRole("button", { name: /^영업 리드 1$/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^신규 리드 1$/ })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^카카오 미등록 매장 2$/ })).toBeVisible();
  expect(searches.at(-1)).toBe("합성");
  // M2b 번호: 묶음 순서대로 영업 1 → 신규 2 → 미등록 3·4
  await expect(panel.getByLabel("지도 번호 1")).toBeVisible();
  await expect(panel.getByLabel("지도 번호 4")).toBeVisible();
  await expect(panel.getByRole("button", { name: "결과 전체 보기" })).toBeVisible();
  await panel.getByRole("button", { name: "결과 전체 보기" }).click(); // 지도 없이 눌러도 패널은 그대로
  if (width >= 1024) await panel.getByText("합성 영업 가게").hover(); // 마우스 올림도 패널을 깨지 않는다
  await expect(panel).toBeVisible();

  // 묶음 접기
  await panel.getByRole("button", { name: /^신규 리드/ }).click();
  await expect(panel.getByText("합성 신규 가게")).toHaveCount(0);

  // 단건: 거래처로 등록 → 등록 창이 열린다(패널은 그대로)
  await panel.getByRole("button", { name: "거래처로 등록" }).first().click();
  // 빠른 등록 창은 상호를 입력칸 값으로 보여 준다(글자로 찾으면 숨은 미리보기 카드를 잡는다)
  const drawer = page.getByRole("complementary").filter({ hasText: "지도 검색 · 빠른 등록" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("상호명 (필수)")).toHaveValue("합성 미등록 식당 1");
  await expect(panel).toBeVisible();
  await drawer.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(panel).toBeVisible();

  // 일괄: 둘 다 선택 → 등록
  await panel.getByLabel("합성 미등록 식당 1 선택").check();
  await panel.getByLabel("합성 미등록 식당 2 선택").check();
  await panel.getByRole("button", { name: "선택 2곳 거래처로 등록" }).click();
  await expect(panel.getByText("2곳을 거래처로 등록했습니다.")).toBeVisible();
  expect(registered).toEqual(["합성 미등록 식당 1", "합성 미등록 식당 2"]);

  // × 로 닫으면 검색어가 지워지고 원래 패널로 돌아온다
  await panel.getByRole("button", { name: "검색 결과 닫기" }).click();
  await expect(panel).toHaveCount(0);
  await expect(search).toHaveValue("");
  await search.fill("합성");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
});
