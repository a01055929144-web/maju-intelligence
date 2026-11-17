// CC-72: 매입가 업로드 "열 정렬" 직후 결과 카드 글. React를 모른다.
export type AlignCounts = { historyRows: number; priceProducts: number; supplierLinks: number; newProducts: number; suspects: number; excludedRows: number };
export type AlignResult = { ok: boolean; text: string };

/** 아무것도 상품에 연결되지 않았으면(저장할 게 없음) 빨간 안내, 아니면 한 줄 요약 + 다음 단계. */
export function alignResultCard(counts: AlignCounts): AlignResult {
  if (!counts.historyRows && !counts.priceProducts && !counts.newProducts) {
    return { ok: false, text: `열 정렬 결과 저장할 줄이 0건입니다 — 상품에 연결된 줄이 없습니다. 매입처 열 · 품목 열을 확인하세요.${counts.excludedRows ? ` (제외 ${counts.excludedRows}행)` : ""}` };
  }
  const suspects = counts.newProducts ? `새 상품 ${counts.newProducts}개(중복 의심 ${counts.suspects}개)` : "새 상품 0개";
  const next = counts.suspects ? "다음: 중복 의심 줄마다 '이 상품으로 연결' 또는 '새 상품 맞음'을 고른 뒤 ③ 저장" : "다음: ③ 저장";
  return { ok: true, text: `열 정렬 완료 · 이력만 ${counts.historyRows}행 / 현재가 변경 ${counts.priceProducts}품목 · 매입처 연결 ${counts.supplierLinks}개 · ${suspects} · 제외 ${counts.excludedRows}행 → ${next}` };
}
