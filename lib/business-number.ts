// 사업자등록번호 형식 검증 공용 모듈. 외부 API 호출 없이 국세청 등록번호 체크섬 알고리즘
// (10번째 자리 검증)만으로 형식이 유효한지 확인합니다 — 비용이 들지 않는 순수 계산입니다.
// 실제 개업/휴업/폐업 여부까지 확인하려면 lib/business-status.ts(NTS 상태조회 API, 선택 설정)를
// 별도로 사용해야 합니다. 이 모듈은 app/page.tsx(엑셀 업로드 검증)와 lib/store.ts(회사 가입 검증)가
// 같은 로직을 중복 없이 공유하기 위해 분리했습니다.

export function normalizeBusinessNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function isValidBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessNumber(value);
  if (!/^[0-9]{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}
