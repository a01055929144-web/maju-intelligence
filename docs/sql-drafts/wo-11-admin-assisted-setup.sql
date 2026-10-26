-- REVIEW ONLY. 운영 적용 전 사용자 승인이 필요합니다.
-- WO-11 관리자 대행 초기 설정의 강제 비밀번호 변경과 설정 완료 도장을 위한 최소 스키마입니다.

begin;

alter table public.app_users
  add column if not exists must_change_password boolean not null default false;

alter table public.companies
  add column if not exists admin_setup_at timestamptz,
  add column if not exists admin_setup_by uuid,
  add column if not exists admin_setup_by_name text;

comment on column public.app_users.must_change_password is
  '관리자가 발급한 임시 비밀번호를 다음 로그인에서 바꿔야 하는지 여부';
comment on column public.companies.admin_setup_at is
  '플랫폼 관리자가 초기 설정 완료를 확인한 시각';
comment on column public.companies.admin_setup_by is
  '초기 설정을 완료 처리한 플랫폼 관리자 식별자. 관리자 계정 모델 확정 전 FK를 두지 않는다.';
comment on column public.companies.admin_setup_by_name is
  '초기 설정 완료 당시 플랫폼 관리자 표시명 스냅샷';

commit;

-- 롤백(운영 실행 전 영향 확인):
-- begin;
-- alter table public.companies
--   drop column if exists admin_setup_by_name,
--   drop column if exists admin_setup_by,
--   drop column if exists admin_setup_at;
-- alter table public.app_users drop column if exists must_change_password;
-- commit;
