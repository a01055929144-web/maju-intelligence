type DncRpcErrorPresentation = {
  message: string;
  status: number;
};

const DNC_RPC_ERROR_PRESENTATIONS: Record<string, DncRpcErrorPresentation> = {
  invalid_channel: {
    message: "지원하지 않는 연락 채널입니다.",
    status: 400
  },
  contact_value_required: {
    message: "등록할 연락처 값을 확인해 주세요.",
    status: 400
  },
  active_company_required: {
    message: "현재 활성 상태인 회사에서만 연락 거부를 변경할 수 있습니다.",
    status: 409
  },
  actor_not_active_company_member: {
    message: "현재 회사의 활성 구성원 권한을 확인할 수 없습니다.",
    status: 403
  },
  contact_value_not_on_lead: {
    message: "입력한 연락처가 이 리드의 최신 정보와 일치하지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
    status: 409
  },
  release_reason_required: {
    message: "연락 거부 해제 사유를 입력해 주세요.",
    status: 400
  },
  invalid_actor_kind: {
    message: "연락 거부를 해제할 사용자 권한을 확인할 수 없습니다.",
    status: 403
  },
  legacy_owner_user_id_must_be_null: {
    message: "현재 소유자 세션 정보가 올바르지 않습니다. 다시 로그인해 주세요.",
    status: 403
  },
  owner_or_manager_required: {
    message: "연락 거부는 소유자 또는 관리자만 해제할 수 있습니다.",
    status: 403
  },
  active_dnc_not_found: {
    message: "활성 연락 거부 기록을 찾을 수 없습니다. 이미 해제되었는지 확인해 주세요.",
    status: 409
  }
};

const UNKNOWN_DNC_RPC_ERROR: DncRpcErrorPresentation = {
  message: "연락 거부 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  status: 500
};

export function presentDncRpcError(error: unknown): DncRpcErrorPresentation {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  const errorCode = Object.keys(DNC_RPC_ERROR_PRESENTATIONS).find((code) => detail.includes(code));
  return errorCode ? DNC_RPC_ERROR_PRESENTATIONS[errorCode] : UNKNOWN_DNC_RPC_ERROR;
}
