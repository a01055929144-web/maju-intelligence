/** 리드 수정 기록(타임라인)에 보이는 lead_actions.action_type 표시 이름. */
export const LEAD_ACTION_TYPE_LABELS: Record<string, string> = {
  call: "전화", dm: "DM", email: "이메일", exclude: "제외", fax: "팩스", hold: "정보 수정·보류", quote: "견적",
  sms: "문자", status: "단계 변경", talktalk: "톡톡", visit: "방문",
  // CX-135: 현장 기록(알바 비치·전단지 등). 영업 성과 "연락"에는 세지 않는다.
  field_visit: "현장 기록"
};
