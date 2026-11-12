// CC-24b: 매입가 업로드에서 "다음에도 제외"로 저장한 코드. supplierName 없음 = 회사 전체, 있음 = 그 매입처 업로드 줄만.
export type ExcludedCode = { id: string; code: string; supplierName: string | null };

const norm = (value: string) => value.trim().toLowerCase();

/** 코드 칸이 빈 줄은 절대 제외하지 않는다(코드가 없으면 같은 줄을 알아볼 수 없다). */
export function matchesExcludedCode(line: { code: string; supplier: string }, saved: ExcludedCode[]): boolean {
  const code = norm(line.code);
  if (!code) return false;
  return saved.some(entry => norm(entry.code) === code && (!entry.supplierName || entry.supplierName === line.supplier.trim()));
}
