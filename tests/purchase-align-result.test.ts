import { expect, it } from "vitest";
import { alignResultCard } from "../lib/purchase-align-result";

it("정상: 한 줄 요약과 다음 단계", () => {
  const r = alignResultCard({ historyRows: 40, priceProducts: 12, supplierLinks: 3, newProducts: 5, suspects: 0, excludedRows: 2 });
  expect(r.ok).toBe(true);
  expect(r.text).toBe("열 정렬 완료 · 이력만 40행 / 현재가 변경 12품목 · 매입처 연결 3개 · 새 상품 5개(중복 의심 0개) · 제외 2행 → 다음: ③ 저장");
});
it("중복 의심이 있으면 다음 단계가 줄마다 고르기", () => {
  expect(alignResultCard({ historyRows: 10, priceProducts: 0, supplierLinks: 0, newProducts: 4, suspects: 2, excludedRows: 0 }).text).toContain("중복 의심 줄마다");
});
it("0건이면 빨간 안내와 이유", () => {
  const r = alignResultCard({ historyRows: 0, priceProducts: 0, supplierLinks: 0, newProducts: 0, suspects: 0, excludedRows: 7 });
  expect(r.ok).toBe(false);
  expect(r.text).toContain("매입처 열 · 품목 열을 확인하세요");
  expect(r.text).toContain("제외 7행");
});
