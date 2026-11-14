// M2b: 지도 검색 결과 줄과 지도 마커에 같은 번호를 붙인다.
// 번호 순서는 패널 묶음 순서(거래처 → 영업 리드 → 신규 리드 → 카카오 미등록)를 그대로 따른다.
export type PinnedRow = { readonly id: string };

export type SearchPinGroups<T extends PinnedRow> = {
  readonly customers: readonly T[];
  readonly salesLeads: readonly T[];
  readonly newLeads: readonly T[];
  readonly unregistered: readonly T[];
};

export function assignSearchPins<T extends PinnedRow>(groups: SearchPinGroups<T>) {
  const pins = new Map<string, number>();
  let next = 1;
  const number = (rows: readonly T[]) =>
    rows.map((row) => {
      // 같은 id가 두 묶음에 걸쳐 나오면 처음 번호를 그대로 쓴다(마커는 하나뿐이므로).
      if (!pins.has(row.id)) pins.set(row.id, next++);
      return { ...row, pin: pins.get(row.id) as number };
    });
  return {
    customers: number(groups.customers),
    salesLeads: number(groups.salesLeads),
    newLeads: number(groups.newLeads),
    unregistered: number(groups.unregistered),
    pins
  };
}
