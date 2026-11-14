// CC-42a-2(M1)·#766 후속: 지도 위 거래처 안내. 거래처가 0~1곳이면 올리라고 알려 주고, 좌표를 못 찾았거나(없음) 근처로 추정해 놓은(추정) 거래처 수를 보여 준다.
export type MapCustomerNotice = { text: string; upload: boolean; unplaced: boolean; approximate: boolean };

export const APPROXIMATE_LOCATION_TITLE = "주소로 정확한 위치를 못 찾아 근처로 표시";

export function mapCustomerNotices(customerCount: number, unplacedCount: number, approximateCount = 0): MapCustomerNotice[] {
  const notices: MapCustomerNotice[] = [];
  if (customerCount <= 1) notices.push({ text: `거래처가 ${customerCount}곳입니다`, upload: true, unplaced: false, approximate: false });
  if (unplacedCount > 0) notices.push({ text: `좌표 못 찾은 거래처 ${unplacedCount}`, upload: false, unplaced: true, approximate: false });
  if (approximateCount > 0) notices.push({ text: `위치 추정 거래처 ${approximateCount}`, upload: false, unplaced: false, approximate: true });
  return notices;
}

export type CustomerLocationState = "unplaced" | "approximate" | "exact";

/** 거래처 한 곳의 위치 상태. 좌표 없음이 근사보다 우선한다(둘 다 들어 있을 수 없지만 방어). */
export function customerLocationState(id: string | undefined, unplacedIds: readonly string[], approximateIds: readonly string[]): CustomerLocationState {
  if (!id) return "exact";
  if (unplacedIds.includes(id)) return "unplaced";
  return approximateIds.includes(id) ? "approximate" : "exact";
}

/** 검색 결과 줄의 상태 칩. 정확한 위치면 원래 칩(관계 상태 등)을 그대로 쓴다. */
export function customerLocationChip(state: CustomerLocationState, fallback: string) {
  return state === "unplaced" ? "좌표 없음 · 주소 확인" : state === "approximate" ? "위치 추정 · 주소 확인" : fallback;
}

/** 거래처 상세에 붙일 안내 문구. 정확한 위치면 빈 문자열. */
export function customerLocationNote(state: CustomerLocationState) {
  if (state === "unplaced") return "주소로 좌표를 찾지 못했습니다. 주소를 확인해 주세요.";
  if (state === "approximate") return `${APPROXIMATE_LOCATION_TITLE}하고 있습니다. 주소를 확인해 주세요.`;
  return "";
}
