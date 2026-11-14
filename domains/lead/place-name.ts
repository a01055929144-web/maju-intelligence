// 상호 정규화·비교(순수 함수). 카카오 보강(lib/place-links)과 소상공인 상가정보 매칭(domains/lead/semas-match)이 같은 규칙을 쓰도록 도메인에 둔다.
// 인프라(카카오·네이버 호출)를 몰라야 하므로 lib/place-links에서 가져다 쓰고 다시 내보낸다.

/** 46-2⓪ 상호 정리 검색어: 괄호 안 지우기 → 법인 표기 지우기 → 끝 '점'/지점명 떼기 → 띄어쓰기 없애기. 원래 상호와 같아지는 변형은 뺀다. */
export function kakaoNameVariants(name: string): Array<{ name: string; variant: "paren_stripped" | "corp_stripped" | "branch_stripped" | "no_space" }> {
  const clean = (v: string) => v.replace(/\s+/g, " ").trim();
  const paren = clean(name.replace(/[(（][^)）]*[)）]/g, " "));
  const corp = clean(name.replace(/[(（]\s*[주유사]\s*[)）]|㈜|주식회사|유한회사/g, " "));
  const branch = clean(corp.replace(/\s+\S*점$/, "").replace(/(?<=[가-힣A-Za-z0-9]{2})점$/, ""));
  const out = [
    { name: paren, variant: "paren_stripped" as const },
    { name: corp, variant: "corp_stripped" as const },
    { name: branch, variant: "branch_stripped" as const },
    { name: clean(name).replace(/\s+/g, ""), variant: "no_space" as const }
  ];
  const seen = new Set([clean(name)]);
  return out.filter((item) => {
    if (item.name.length < 2 || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

/** 상호 비슷한 정도(글자 2개 묶음 Dice, 0~1). 버린 후보 기록용 — 판정에는 쓰지 않는다. */
export function placeNameScore(a: string, b: string) {
  const x = normalizePlaceName(a);
  const y = normalizePlaceName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (v: string) => Array.from({ length: Math.max(v.length - 1, 1) }, (_, i) => v.slice(i, i + 2));
  const gx = grams(x);
  const gy = grams(y);
  let hit = 0;
  for (const g of gx) {
    const at = gy.indexOf(g);
    if (at >= 0) { hit += 1; gy.splice(at, 1); }
  }
  return Math.round((2 * hit / (gx.length + grams(y).length)) * 100) / 100;
}

export function normalizePlaceName(value: string) {
  return value.toLowerCase().replace(/<[^>]*>/g, "").replace(/&[a-z0-9#]+;/g, "").replace(/\(주\)|㈜|\(유\)|\(사\)|주식회사|유한회사/g, "").replace(/[^0-9a-z가-힣]/g, "");
}
