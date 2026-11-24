import { isInvalidSupabaseApiKeyError, isMissingStaffAssignmentOverrideColumnError } from "./00-supabase-helpers";

export const STAFF_INVITATIONS_MIGRATION_MESSAGE =
  "직원 초대 저장소가 아직 준비되지 않았습니다. Supabase SQL Editor에서 직원 초대 스키마를 적용한 뒤 다시 시도해주세요.";
// 2026-09-11 감사: staff_invitations.assigned_manager_name/assigned_vehicle(카카오 닉네임과
// 등록된 담당자명이 달라 자동 매칭이 실패하는 경우를 위한 수동 배정 override, 20260907_
// staff_assignment_override.sql)은 초대 코드 조회 select= 목록에 하드코딩되어 있어, 이 마이그
// 레이션이 프로덕션에 적용되지 않은 상태면 초대 링크로 들어오는 모든 조회(모바일 직원
// 가입/로그인 포함)가 원인을 알 수 없는 Supabase 원본 에러로 즉시 실패한다. 다른 다섯 개
// 마이그레이션(company_message_settings/company_job_titles/company_closure/login_throttle/
// permit_sync_cursor)은 이미 각자 "어떤 마이그레이션을 실행하라"는 명확한 안내로 잡혀 있는데
// 이 컬럼만 빠져 있었다(docs/pages/settings.md KNOWN ISSUES 참고) — 진단 메시지만 보강한다.
export const STAFF_ASSIGNMENT_OVERRIDE_MIGRATION_MESSAGE =
  "담당자/차량 수동 배정을 저장하거나 불러올 수 없습니다. Supabase에 assigned_manager_name/assigned_vehicle 컬럼이 아직 없습니다. supabase/migrations/20260907_staff_assignment_override.sql을 먼저 실행하세요.";
export const SUPABASE_CONNECTION_KEY_MESSAGE =
  "Supabase 연결 키가 현재 프로젝트와 맞지 않습니다. Vercel 환경변수의 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 같은 Supabase 프로젝트 값으로 맞춘 뒤 재배포해주세요.";

export function isMissingStaffInvitationTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST205") && message.includes("staff_invitations");
}

export function isMissingStaffMobileLocationSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("staff_mobile_devices") &&
    (message.includes("PGRST205") ||
      message.includes("last_lat") ||
      message.includes("last_lng") ||
      message.includes("last_location_at") ||
      message.includes("location_status") ||
      message.includes("schema cache"))
  );
}


export function normalizeStaffStoreError(error: unknown): never {
  if (isMissingStaffInvitationTableError(error)) throw new Error(STAFF_INVITATIONS_MIGRATION_MESSAGE);
  if (isMissingStaffAssignmentOverrideColumnError(error)) throw new Error(STAFF_ASSIGNMENT_OVERRIDE_MIGRATION_MESSAGE);
  if (isInvalidSupabaseApiKeyError(error)) throw new Error(SUPABASE_CONNECTION_KEY_MESSAGE);
  throw error instanceof Error ? error : new Error(String(error));
}

export function staffStoreRequest<T>(request: Promise<T>) {
  return request.catch(normalizeStaffStoreError);
}
