/** CC-46-4 폐업 판정 한 곳: 리드 상태가 '폐업…'(예: 폐업 확인 필요)이거나 인허가 상태에 폐업·말소·취소가 있으면 닫힌 곳. */
export function isClosedLead(lead: { status?: string | null; permitStatus?: string | null }) {
  return /^폐업/.test(lead.status || "") || /폐업|말소|취소/.test(lead.permitStatus || "");
}
