import { expect, test } from "@playwright/test";

// 48-7ⓐ: 지도 거래처 상세의 "배송 완료 사진" — delivery_proof 첨부만 올린 순서대로 보이고, 없으면 빈 상태. 가짜 API만 쓴다.
const png = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const attachment = (id: string, attachmentType: string, title: string, createdAt: string) => ({ id, attachmentType, createdAt, fileUrl: png, mimeType: "image/gif", title });

for (const width of [1440, 390]) test(`지도 상세 배송 완료 사진: 사진 2장은 올린 순서대로, 0장은 빈 상태 (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  let attachments = [
    attachment("a1", "delivery_proof", "가짜 완료 사진 최신", "2026. 11. 15. 오후 3:00:00"),
    attachment("a2", "loading_position", "가짜 하차지 사진", "2026. 11. 14. 오후 2:00:00"),
    attachment("a3", "delivery_proof", "가짜 완료 사진 이전", "2026. 11. 10. 오전 9:00:00")
  ];
  await page.route(/\/api\/customer-operations\?/, (route) => route.fulfill({ json: { attachments, notes: [], messageLogs: [] } }));
  await page.goto("/map");
  await page.getByRole("button", { name: "A", exact: true }).first().click(); // 거래처 마커(A등급) 선택 → 퀵카드
  await page.getByRole("button", { name: "상세 열기" }).first().click();
  const section = page.getByRole("region", { name: "배송 완료 사진" });
  await expect(section.getByRole("img")).toHaveCount(2);
  await expect(section.getByRole("img").first()).toHaveAttribute("alt", "가짜 완료 사진 최신");
  await expect(section.getByRole("img").nth(1)).toHaveAttribute("alt", "가짜 완료 사진 이전");
  await expect(section.getByText("2026. 11. 15. 오후 3:00:00")).toBeVisible();

  // 0장이면 빈 상태
  attachments = attachments.filter((item) => item.attachmentType !== "delivery_proof");
  await page.reload();
  await page.getByRole("button", { name: "A", exact: true }).first().click();
  await page.getByRole("button", { name: "상세 열기" }).first().click();
  await expect(page.getByRole("region", { name: "배송 완료 사진" }).getByText("배송 완료 사진이 없습니다.")).toBeVisible();
});
