import { expect, test, type Page } from "@playwright/test";

// CC-45-2: 지도 분리(45-3) 전 안전망. 점검 보고 R2·R4를 다룬다.
// R4는 재현 후 같은 PR에서 고침(대시보드 지도에 companyId key). 재현하지 못했거나 아직 못 켜는 것은 test.fixme.
const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const now = new Date().toISOString();

const lead = (id: string, name: string) => ({
  id, businessName: name, isActive: true, address: `서울 중구 ${name}`, latitude: 37.56, longitude: 126.98, leadPeriod: "old", industryPrimary: "한식", industryTags: [],
  isTargetIndustry: true, isTemporaryOperation: false, isTemporaryOperationSuspected: false, isDuplicate: false, status: "신규", nextActionReasons: [], scoreTotal: 50, scoreBreakdown: {}, grade: "B", createdAt: now, updatedAt: now,
});
const leadsBody = (names: string[]) => ({ leads: names.map((n, i) => lead(`30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, n)), salesRegionsConfigured: true });
const closedLead = (id: string, name: string) => ({ ...lead(id, name), status: "폐업 확인 필요" });
// 리드 유형 필터의 "영업 N" 버튼. 지도 레이어 칩("영업 0", title="영업 리드 레이어 …")도 같은 이름이라 title 없는 버튼만 잡는다.
const salesCount = (page: Page) => page.getByRole("button", { name: /^영업 \d+/ }).and(page.locator("button:not([title])"));

test.use({ viewport: { width: 1440, height: 900 } });

// R2는 CI 고정 데이터로 재현하지 못했다(11/13 확인): 리드 필터 칸(영업 지역 밖도 보기·유통사/매장)은 첫 리드 응답이 와야
// 나타나서(mapSalesRegionsConfigured·distributorSales가 응답에서 정해짐) 첫 요청이 끝나기 전에 두 번째 요청을 만들 수 없다.
// 45-3g에서 요청 순서 도우미(use-map-data)를 만들 때 그 도우미 단위 테스트로 "늦게 온 옛 응답 무시"를 고정한다.
test.fixme("R2: 먼저 보낸 느린 응답이 나중에 바꾼 필터의 결과를 덮지 않는다 (45-3g에서 켠다)", () => {});

test("R4: 관리자 미리보기에서 회사를 바꾸면 이전 회사 리드가 남지 않는다", async ({ page }) => {
  expect((await page.request.post("/api/admin/login", { data: { email: "ci-admin@example.test", password: "ci-admin-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/leads\/permits\?/, (route) => {
    const company = new URL(route.request().url()).searchParams.get("companyId");
    return route.fulfill({ json: leadsBody(company === COMPANY_B ? ["B사 가게"] : ["A사 가게 1", "A사 가게 2"]) });
  });
  await page.goto(`/map?companyId=${COMPANY_A}`);
  await expect(salesCount(page)).toHaveText(/영업 2/);
  // 새로고침 없이 앱 안 이동(관리자 회사 목록에서 다른 회사를 고르는 것과 같은 경로)
  await page.evaluate((id) => (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push(`/map?companyId=${id}`), COMPANY_B);
  await expect(page).toHaveURL(new RegExp(COMPANY_B));
  await expect(salesCount(page)).toHaveText(/영업 1/);
});

test.fixme("R1: 필터를 바꿔도 지도 위치·확대가 유지된다 (42a에서 켠다)", () => {
  // CI에는 카카오 지도 SDK가 없어 지도가 만들어지지 않는다 — 42a에서 SDK 스텁(window.kakao)을 넣어 켠다.
});

// CC-46-4: 폐업 리드는 지도에서 기본 제외, "폐업 리드 포함"을 켜면 보인다.
test("closed leads are hidden on the map unless asked for", async ({ page }) => {
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const body = { leads: [lead("30000000-0000-4000-8000-000000000001", "영업 가게 1"), lead("30000000-0000-4000-8000-000000000002", "영업 가게 2"), closedLead("30000000-0000-4000-8000-000000000003", "폐업 가게")], salesRegionsConfigured: true };
  await page.route(/\/api\/leads\/permits\?/, (route) => route.fulfill({ json: body }));
  await page.goto("/map");
  await expect(salesCount(page)).toHaveText(/영업 2/);
  await page.getByRole("button", { name: "필터 더보기" }).click();
  await page.getByLabel("폐업 리드 포함").check();
  await expect(salesCount(page)).toHaveText(/영업 3/);
});

// CC-42a-2(M1): 거래처 1곳일 때 지도 위 안내는 거래처 원장이 있어야(sourceReady) 지도가 열려 CI 고정 데이터로는 못 본다 — 0곳은 기존 "거래처 원장 필요" 화면.
// 안내 문구 규칙은 단위 테스트 tests/map-customer-notice.test.ts, 화면은 배포 뒤 컨트롤타워가 운영(제이에스리테일 1곳)에서 확인.
test.fixme("거래처가 1곳이면 지도 위에 거래처 올리기 안내가 보인다 (거래처 원장 고정 데이터가 생기면 켠다)", () => {});
