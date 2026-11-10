import { expect, test } from "@playwright/test";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "30000000-0000-4000-8000-000000000001";
const href = `/store/members?companyId=${companyId}&storeAccountId=${storeAccountId}`;

for (const width of [1440, 390]) test(`verified store member entry keeps role and token boundaries at ${width}px`, async ({ page }, info) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width, height: 900 });
  let retryFailed = true, memberReads = 0, writes = 0;
  await page.route("**/api/store/members?*", route => {
    memberReads++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("companyId")).toBe(companyId);
    expect(url.searchParams.get("storeAccountId")).toBe(storeAccountId);
    return route.fulfill({ json: { actorMemberId: "member", actorRole: "owner", members: [] } });
  });
  await page.route("**/api/storefront", route => {
    if (route.request().method() !== "POST") { writes++; return route.abort(); }
    const token = route.request().postDataJSON().token;
    if (token === "revoked") return route.fulfill({ status: 404, json: { message: "합성 링크를 사용할 수 없습니다. 새 링크를 확인해 주세요." } });
    const memberManagement = token === "off" ? undefined : token === "staff" || token === "anonymous"
      ? { message: "구성원 관리는 이 매장의 점주·관리자로 로그인한 뒤 이용해 주세요." }
      : token === "retry" && retryFailed ? { message: "구성원 권한을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." } : { href };
    return route.fulfill({ json: {
      store: { title: "합성 매장 링크", companyName: "합성 유통", customerName: "합성 매장", deliveryAddress: null, version: 1, validUntil: "2099-12-31",
        priceAvailable: true, canOrder: true, deliveryEligibility: { eligible: true, reason: "eligible", weekdays: [0,1,2,3,4,5,6] }, nextDeliveryDate: "2099-01-05", selectedDeliveryDate: "2099-01-05", notice: "", marketPriceNotice: "", lines: [],
        policy: { weekdays: [0,1,2,3,4,5,6], holidays: [], cutoffDaysBefore: 0, cutoffTime: "22:00", minimumAmount: 0, minimumPolicy: "notice", deliveryFee: 0 } },
      memberManagement, orders: [], preferences: [], historyPage: 1, historyHasMore: false,
    } });
  });
  await page.goto("/store");
  await expect(page.getByRole("heading", { name: "MAJU 매장" })).toBeVisible();
  await expect(page.getByText("첫 가입은 받은 견적서·단가표 링크에서 진행합니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "구성원 관리", exact: true })).toHaveCount(0);
  for (const token of ["owner", "manager", "staff", "anonymous", "off", "retry"]) {
    await page.goto(`/store#${token}`);
    await page.getByRole("button", { name: "내 정보", exact: true }).click();
    const entry = page.getByRole("link", { name: "구성원 관리", exact: true });
    if (token === "owner" || token === "manager") {
      await expect(entry).toHaveAttribute("href", href);
      expect((await entry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: info.outputPath(`store-members-entry-${token}-${width}.png`), fullPage: true });
      if (token === "owner") {
        await entry.click();
        await expect(page).toHaveURL(new RegExp("/store/members\\?companyId="));
        await expect(page.getByText("등록된 구성원이 없습니다. 직원 초대로 시작해 주세요.", { exact: true })).toBeVisible();
      }
    } else {
      await expect(entry).toHaveCount(0);
      if (token !== "off") await expect(page.getByRole("status")).toContainText(token === "retry" ? "다시 확인" : "점주·관리자로 로그인");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  }
  retryFailed = false;
  await page.getByRole("button", { name: "권한 다시 확인", exact: true }).click();
  await expect(page.getByRole("link", { name: "구성원 관리", exact: true })).toHaveAttribute("href", href);
  await page.evaluate(() => { window.location.hash = "revoked"; });
  await expect(page.getByText("합성 링크를 사용할 수 없습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "구성원 관리", exact: true })).toHaveCount(0);
  expect(memberReads).toBe(1);
  expect(writes).toBe(0);
});
