/** 11/4: 단가표·견적서 상품 목록 빠른 필터(순수 함수). */
export type IndexItem = { id: string; code: string; name: string; displayName: string; spec: string; unit: string };
const norm = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/** 상세 조건(코드·상품명·규격·단위)과 통합 검색으로 상품을 거릅니다. */
export function filterIndex(items: readonly IndexItem[], f: { all: string; code: string; name: string; spec: string; unit: string }) {
  const all = norm(f.all), code = norm(f.code), name = norm(f.name), spec = norm(f.spec);
  return items.filter((item) =>
    (!all || norm(`${item.code} ${item.name} ${item.displayName} ${item.spec} ${item.unit}`).includes(all)) &&
    (!code || norm(item.code).includes(code)) &&
    (!name || norm(`${item.name} ${item.displayName}`).includes(name)) &&
    (!spec || norm(item.spec).includes(spec)) &&
    (!f.unit || item.unit === f.unit)
  );
}

