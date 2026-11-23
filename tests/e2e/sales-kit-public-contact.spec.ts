import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) test(`공개 문의 연락처는 명시 동의 후에만 저장된다 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  const kit = {
    contactLabel: "합성 영업팀",
    contactPhone: "01012345678",
    defaults: {},
    fields: ["contact"],
    materials: [],
    orderCode: "",
    orderUrl: "",
    priceSheetUrl: "",
    publicContactEnabled: false
  };
  let saved: typeof kit | undefined;
  await page.route(/\/api\/sales-kit(?:\?|$)/, async (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON() as typeof kit;
      return route.fulfill({ json: { kit: saved, ok: true } });
    }
    return route.fulfill({ json: { canEdit: true, fallbackPhone: "01099998888", kit } });
  });

  await page.goto("/dashboard/settings/sales");
  const consent = page.getByRole("checkbox", { name: "공개 문서에 문의 연락처 표시" });
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장했습니다. 리드 상세의 보낼 문구 아래에 바로 반영됩니다.")).toBeVisible();
  expect(saved?.publicContactEnabled).toBe(true);
  expect(saved?.contactPhone).toBe("01012345678");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
