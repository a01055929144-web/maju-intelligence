// CC-24b: 매입가 업로드에서 "다음에도 제외"로 저장한 코드. supplierName 없음 = 회사 전체, 있음 = 그 매입처 업로드 줄만.
export type ExcludedCode = { id: string; code: string; supplierName: string | null };

const norm = (value: string) => value.trim().toLowerCase();

/** 코드 칸이 빈 줄은 절대 제외하지 않는다(코드가 없으면 같은 줄을 알아볼 수 없다). */
export function matchesExcludedCode(line: { code: string; supplier: string }, saved: ExcludedCode[]): boolean {
  const code = norm(line.code);
  if (!code) return false;
  return saved.some(entry => norm(entry.code) === code && (!entry.supplierName || entry.supplierName === line.supplier.trim()));
}

/**
 * CC-33c: 월 합계 줄("2026/10 계")이 상품으로 들어가지 않게, 합계처럼 보이는 줄의 행 번호를 돌려준다(자동 "제외" 체크용).
 * ① 상품명이 계·합계·소계로 끝남 ② 상품명이 날짜(2026/10, 2026-10-01 …)로 시작 ③ 단가가 나머지 줄 중앙값의 100배 초과.
 */
export function flagSummaryLines(lines: Array<{ rowNumber: number; name: string; rawCost: number }>): number[] {
  const costs = lines.map(line => line.rawCost).filter(cost => Number.isFinite(cost) && cost > 0).sort((a, b) => a - b);
  const median = costs.length ? costs[Math.floor(costs.length / 2)] : 0;
  return lines
    .filter(line => {
      const name = line.name.trim();
      return /(소계|합계|계)$/.test(name) || /^\d{4}[./-]\d{1,2}/.test(name) || (median > 0 && line.rawCost > median * 100);
    })
    .map(line => line.rowNumber);
}
