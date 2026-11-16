import { expect, test } from "@playwright/test";

// 48-7ⓐ: 지도 거래처 상세의 "배송 완료 사진" — delivery_proof 첨부만 올린 순서대로 보이고, 없으면 빈 상태. 가짜 API만 쓴다.
const png = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const attachment = (id: string, attachmentType: string, title: string, createdAt: string) => ({ id, attachmentType, createdAt, fileUrl: png, mimeType: "image/gif", title });
const withPhotos = [
  attachment("a1", "delivery_proof", "가짜 완료 사진 최신", "2026. 11. 15. 오후 3:00:00"),
  attachment("a2", "loading_position", "가짜 하차지 사진", "2026. 11. 14. 오후 2:00:00"),
  attachment("a3", "delivery_proof", "가짜 완료 사진 이전", "2026. 11. 10. 오전 9:00:00")
];

async function openDetail(page: import("@playwright/test").Page, width: number, attachments: typeof withPhotos) {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route(/\/api\/customer-operations\?/, (route) => route.fulfill({ json: { attachments, notes: [], messageLogs: [] } }));
  await page.goto("/map");
  await page.getByRole("button", { name: "A", exact: true }).first().click(); // 거래처 마커(A등급) 선택 → 퀵카드
  await page.getByRole("button", { name: "상세 열기" }).first().click();
  return page.getByRole("region", { name: "배송 완료 사진" });
}

for (const width of [1440, 390]) {
  test(`지도 상세 배송 완료 사진: 사진 2장은 올린 순서대로, 하차지 사진은 빼고 (${width}px)`, async ({ page }) => {
    const section = await openDetail(page, width, withPhotos);
    await expect(section.locator("img")).toHaveCount(2);
    await expect(section.locator("img").first()).toHaveAttribute("alt", "가짜 완료 사진 최신");
    await expect(section.locator("img").nth(1)).toHaveAttribute("alt", "가짜 완료 사진 이전");
    await expect(section.getByText("2026. 11. 15. 오후 3:00:00")).toBeVisible();
  });

  test(`지도 상세 배송 완료 사진: 0장이면 빈 상태 (${width}px)`, async ({ page }) => {
    const section = await openDetail(page, width, withPhotos.filter((item) => item.attachmentType !== "delivery_proof"));
    await expect(section.getByText("배송 완료 사진이 없습니다.")).toBeVisible();
  });
}
