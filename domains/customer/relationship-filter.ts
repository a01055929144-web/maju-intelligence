// 거래처 목록·지도에 보일지(거래 상태·사업자 상태 기준).
// 거래 종료(수동)는 기본으로 숨기고 "거래 종료 거래처 보기"를 켜야 보인다(11/14 대표: 거래 종료를 눌렀는데 목록에 남아 있음).
// 사업자 폐업(자동 조회)은 지금처럼 "이탈 거래처 제외"를 켰을 때만 뺀다.
export const RELATIONSHIP_TERMINATED = "거래종료";

/** 상태 칩 글자: 거래 종료는 띄어 쓴 고정 문구, 그 밖은 원문(없으면 fallback). 상세 머리·검색 결과가 같이 쓴다. */
export function relationshipLabel(status: string | null | undefined, fallback = "거래중") {
  return status === RELATIONSHIP_TERMINATED ? "거래 종료" : status || fallback;
}

export const TERMINATED_HIDDEN_NOTICE = "거래 종료 거래처라 기본 지도에서 숨겨져 있습니다";

/** 거래 종료라서 지금 지도·목록에 안 보이는 거래처인가(사업자 폐업으로 빠진 것은 해당 없음). */
export function isTerminatedHiddenOnMap(
  store: { relationshipStatus?: string | null; businessStatus?: string | null },
  options: { excludeClosed: boolean; showTerminated: boolean }
) {
  return store.relationshipStatus === RELATIONSHIP_TERMINATED && !isStoreVisibleByStatus(store, options);
}

export function isStoreVisibleByStatus(
  store: { relationshipStatus?: string | null; businessStatus?: string | null },
  options: { excludeClosed: boolean; showTerminated: boolean }
) {
  if (store.relationshipStatus === RELATIONSHIP_TERMINATED && !options.showTerminated) return false;
  if (options.excludeClosed && (store.businessStatus === "closed" || store.relationshipStatus === RELATIONSHIP_TERMINATED)) return false;
  return true;
}
