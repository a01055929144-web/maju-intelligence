import { describe, expect, it } from "vitest";
import { presentDncRpcError } from "../domains/lead/dnc-rpc-errors";

describe("DNC RPC error presentation", () => {
  it.each([
    ["invalid_channel", 400, "지원하지 않는 연락 채널입니다."],
    ["contact_value_required", 400, "등록할 연락처 값을 확인해 주세요."],
    ["active_company_required", 409, "현재 활성 상태인 회사에서만 연락 거부를 변경할 수 있습니다."],
    ["actor_not_active_company_member", 403, "현재 회사의 활성 구성원 권한을 확인할 수 없습니다."],
    [
      "contact_value_not_on_lead",
      409,
      "입력한 연락처가 이 리드의 최신 정보와 일치하지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
    ],
    ["release_reason_required", 400, "연락 거부 해제 사유를 입력해 주세요."],
    ["invalid_actor_kind", 403, "연락 거부를 해제할 사용자 권한을 확인할 수 없습니다."],
    ["legacy_owner_user_id_must_be_null", 403, "현재 소유자 세션 정보가 올바르지 않습니다. 다시 로그인해 주세요."],
    ["owner_or_manager_required", 403, "연락 거부는 소유자 또는 관리자만 해제할 수 있습니다."],
    ["active_dnc_not_found", 409, "활성 연락 거부 기록을 찾을 수 없습니다. 이미 해제되었는지 확인해 주세요."]
  ])("maps %s to a Korean user response", (code, status, message) => {
    const result = presentDncRpcError(new Error(`Supabase request failed: 400 {\"message\":\"${code}\"}`));

    expect(result).toEqual({ message, status });
  });

  it("does not expose an unknown database error", () => {
    const secretDetail = "unexpected_database_detail with private table data";
    const result = presentDncRpcError(new Error(secretDetail));

    expect(result).toEqual({
      message: "연락 거부 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      status: 500
    });
    expect(result.message).not.toContain(secretDetail);
  });
});
