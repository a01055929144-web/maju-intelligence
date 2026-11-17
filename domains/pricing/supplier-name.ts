/**
 * 11/17: 거래처(매입처·매출처) 이름 비교 키.
 * "(주)프렌즈푸드코리아" · "㈜프렌즈푸드코리아" · "주식회사 프렌즈푸드코리아" · "프렌즈푸드코리아(주)"를 같은 회사로 본다.
 * 법인 표기(주식회사·유한회사·합자회사·합명회사·(주)·(유)·(합)·(사)·(재))와 띄어쓰기·대소문자만 무시한다. 화면 표시 이름은 바꾸지 않는다.
 */
const CORPORATE_MARKS = /\((?:주|유|합|사|재)\)|주식회사|유한회사|유한책임회사|합자회사|합명회사|사단법인|재단법인/g;

export function supplierNameKey(name: string) {
  return (name || "").normalize("NFKC").replace(CORPORATE_MARKS, "").replace(/\s+/g, "").toLocaleLowerCase("ko").trim();
}

/** 이미 등록된 이름 중 같은 회사가 있으면 그 이름을 쓴다(새 매입처를 또 만들지 않는다). */
export function resolveExistingSupplierName(name: string, existing: readonly string[]) {
  const key = supplierNameKey(name);
  if (!key) return name.trim();
  return existing.find((candidate) => supplierNameKey(candidate) === key) ?? name.trim();
}
