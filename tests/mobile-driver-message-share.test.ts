import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync("components/mobile-delivery-proof-panel.tsx", "utf8");

it("CX-46b는 사진, 기사 템플릿, 휴대폰 공유창을 한 완료 흐름으로 잇는다", () => {
  expect(source).toContain('<MessageTemplateManager compact mode="driver"');
  expect(source).toContain("await navigator.share(shareData)");
  expect(source).toContain("shareData.files = filesWithMessage");
  expect(source).toContain('label={status === "saved" ? "완료 · 다음 매장으로 이동"');
  expect(source).toContain('"밀어서 배송 완료"');
});
