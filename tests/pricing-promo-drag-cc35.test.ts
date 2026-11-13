import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const paper = readFileSync("components/pricing-doc-paper.tsx", "utf8");
const picker = readFileSync("components/pricing-product-picker.tsx", "utf8");

it("CC-35-1: promo rows reuse the regular drag handle/drop code and only reorder within the promo block", () => {
  expect(paper.match(/title="끌어서 행사 순서 변경"/g)?.length).toBe(2); // 표 보기·카드 보기
  expect(paper.match(/dropLine\(index\)/g)?.length).toBeGreaterThanOrEqual(3); // 일반 줄 + 행사 줄 2곳
  expect(paper).toContain("Boolean(content.lines[draggedLine.current]?.promotionId) !== Boolean(content.lines[target]?.promotionId)");
  expect(paper).toContain("행사 화면에서 수정");
});
it("CC-35-1: the 행사·임박 tab of the picker selects several and adds them at once", () => {
  expect(picker).toContain("선택 {pickedPromos.size}개 담기");
  expect(picker).toContain("onAddPromotions(promotions.filter(");
});
