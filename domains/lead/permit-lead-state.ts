import { isSelectableLeadStatus } from "./lead-status";
import { resolveVisitResultStatus } from "./lead-policy";

export type PermitLeadPeriod = "today" | "week" | "month" | "recent";

export type PermitLeadActionType = "call" | "dm" | "visit" | "hold" | "exclude" | "quote" | "sms" | "talktalk" | "email" | "fax" | "status";

const ACTION_TO_STATUS: Record<PermitLeadActionType, string> = {
  call: "전화 대상",
  dm: "DM 발송",
  email: "이메일 발송",
  exclude: "제외",
  fax: "팩스 발송",
  hold: "검토 필요",
  quote: "견적 요청",
  sms: "문자 발송",
  status: "검토 필요",
  talktalk: "톡톡 발송",
  visit: "방문 대상"
};

const RESULT_TO_STATUS: Record<string, string> = {
  부재: "방문 대상",
  관심: "미팅 예정",
  "단가표 전달": "재연락 예정",
  "재방문 예정": "재연락 예정",
  "거래 시작": "전환 진행",
  "통화 성공": "연락 완료",
  부재중: "전화 대상",
  "DM 발송": "DM 발송",
  "문자 발송": "문자 발송",
  "톡톡 발송": "톡톡 발송",
  "이메일 발송": "이메일 발송",
  "팩스 발송": "팩스 발송",
  "관심 있음": "미팅 예정",
  "견적 요청": "견적 요청",
  "견적 발송": "견적 발송",
  "재연락 예정": "재연락 예정",
  "다음 방문": "방문 대상",
  보류: "검토 필요",
  거절: "거절",
  제외: "제외"
};

export function computePermitLeadPeriod(permitDateText: string | null | undefined, referenceDate: Date = new Date()): PermitLeadPeriod {
  if (!permitDateText) return "recent";
  const permitDate = new Date(permitDateText);
  if (Number.isNaN(permitDate.getTime())) return "recent";

  const startOfToday = new Date(referenceDate);
  startOfToday.setHours(0, 0, 0, 0);
  const dayOfWeek = startOfToday.getDay() || 7;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek - 1));
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  if (permitDate >= startOfToday) return "today";
  if (permitDate >= startOfWeek) return "week";
  if (permitDate >= startOfMonth) return "month";
  return "recent";
}

export function resolvePermitLeadStatus(actionType: PermitLeadActionType, result?: string) {
  if (actionType === "status") return isSelectableLeadStatus(result) ? result : "검토 필요";
  return resolveVisitResultStatus(actionType, result) || (result && RESULT_TO_STATUS[result]) || ACTION_TO_STATUS[actionType] || "검토 필요";
}
