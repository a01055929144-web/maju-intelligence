// CC-30d: 견적서 줄 가격 한 곳 규칙 — 매장 가격 > 등급가(마진 템플릿) > 기본 판매가. 값이 없거나 0 이하면 다음 단계로 내려간다.
export type DocumentPriceSource = "store" | "grade" | "base";

export function pickDocumentPrice(input: { store?: number | null; grade?: number | null; base?: number | null }): { price: number; source: DocumentPriceSource } | null {
  if (input.store != null && input.store > 0) return { price: input.store, source: "store" };
  if (input.grade != null && input.grade > 0) return { price: input.grade, source: "grade" };
  if (input.base != null && input.base > 0) return { price: input.base, source: "base" };
  return null;
}
