// 시안 ⑫ 필터 칩은 여러 개를 고를 수 있습니다. 기존 저장 필터(문자열 1개)와 호환되도록
// 상태는 그대로 문자열로 두고 "|"로 이어 붙입니다 — 값이 하나면 예전과 완전히 같은 문자열입니다.
export function splitMultiFilter(value: string) {
  return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

export function toggleMultiFilter(value: string, item: string) {
  const current = splitMultiFilter(value);
  return (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]).join("|");
}

export function summarizeMultiFilter(value: string, fallback: string, labelOf: (item: string) => string = (item) => item) {
  const items = splitMultiFilter(value);
  if (!items.length) return fallback;
  return items.length === 1 ? labelOf(items[0]) : `${labelOf(items[0])} +${items.length - 1}`;
}

// 영업 지역 라벨("서울특별시 강남구")과 리드 주소에서 뽑은 시군구("강남구")를 맞춰 봅니다.
export function areaLabelMatchesSigungu(label: string, sigungu: string) {
  if (!label || !sigungu) return false;
  const tokens = label.trim().split(/\s+/);
  return tokens.includes(sigungu) || tokens.slice(1).join(" ") === sigungu || label.trim() === sigungu;
}

// 검색창 "상호·주소·전화": 하이픈·공백 없이 숫자 3자리 이상이면 전화번호 일부로도 찾습니다.
export function phoneDigitsMatch(phone: string | null | undefined, keyword: string) {
  const digits = keyword.replace(/\D/g, "");
  if (digits.length < 3 || digits.length !== keyword.replace(/[\s-]/g, "").length) return false;
  return (phone || "").replace(/\D/g, "").includes(digits);
}
