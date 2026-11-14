// 거래처 목록·지도에 보일지(거래 상태·사업자 상태 기준).
// 거래 종료(수동)는 기본으로 숨기고 "거래 종료 거래처 보기"를 켜야 보인다(11/14 대표: 거래 종료를 눌렀는데 목록에 남아 있음).
// 사업자 폐업(자동 조회)은 지금처럼 "이탈 거래처 제외"를 켰을 때만 뺀다.
export const RELATIONSHIP_TERMINATED = "거래종료";

export function isStoreVisibleByStatus(
  store: { relationshipStatus?: string | null; businessStatus?: string | null },
  options: { excludeClosed: boolean; showTerminated: boolean }
) {
  if (store.relationshipStatus === RELATIONSHIP_TERMINATED && !options.showTerminated) return false;
  if (options.excludeClosed && (store.businessStatus === "closed" || store.relationshipStatus === RELATIONSHIP_TERMINATED)) return false;
  return true;
}
