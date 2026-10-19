const GENERIC_STAFF_NAMES = new Set(["", "직원", "모바일 직원", "배송기사", "모바일 담당자", "개인 사용자"]);

export type StaffDisplayNameSource = {
  readonly appUserName?: string | null;
  readonly invitationEmployeeName?: string | null;
};

/** 회사 안에서 사용하는 직원 표시 이름을 한 곳에서 결정합니다. */
export function resolveCompanyStaffDisplayName(source: StaffDisplayNameSource) {
  const invitationName = normalizeStaffDisplayName(source.invitationEmployeeName);
  if (invitationName) return invitationName;

  const appUserName = normalizeStaffDisplayName(source.appUserName);
  return appUserName || "이름 미등록 직원";
}

export function normalizeStaffDisplayName(value?: string | null) {
  const normalized = (value || "").trim();
  return GENERIC_STAFF_NAMES.has(normalized) ? undefined : normalized;
}

/** 재로그인에서는 최초 소셜 프로필 이름을 보존하고 회사 표시 이름과 섞지 않습니다. */
export function preserveSocialProfileName(existingName?: string | null, incomingName?: string | null) {
  return existingName?.trim() || incomingName?.trim() || "모바일 직원";
}
