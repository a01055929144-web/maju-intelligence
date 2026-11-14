// 주소를 좌표로 못 바꿨을 때 한 번 더 찾아볼 근사 주소(11/14 "서울 서대문구 명물길 50-4"가 카카오 주소 검색에서 안 나옴).
// 건물 부번(-4)·층·호·괄호를 떼고 도로명+본번까지만 남긴다. 원래 주소와 같으면 빈 값.
export function approximateRoadAddress(address: string) {
  const clean = address.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const match = clean.match(/^(.*?(?:로|길)(?:\s*\d+번길)?)\s*(\d+)(?:-\d+)?(?:\s.*)?$/);
  if (!match) return "";
  const approx = `${match[1]} ${match[2]}`.replace(/\s+/g, " ").trim();
  return approx !== clean ? approx : "";
}

/** 장소 검색어: 상호 + 시군구(예: "홍곱창 신촌점 서대문구"). 시군구를 못 찾으면 상호만. */
export function placeKeywordForAddress(name: string, address: string) {
  const district = address.split(/\s+/).find((token, index) => index > 0 && /(?:시|군|구)$/.test(token)) || "";
  return [name.trim(), district].filter(Boolean).join(" ");
}

/** 장소 검색 결과가 같은 시군구인지(다른 동네 같은 상호 방지). 시군구를 모르면 통과. */
export function isSameDistrict(address: string, candidateAddress: string) {
  const district = address.split(/\s+/).find((token, index) => index > 0 && /(?:시|군|구)$/.test(token));
  return !district || candidateAddress.split(/\s+/).includes(district);
}
