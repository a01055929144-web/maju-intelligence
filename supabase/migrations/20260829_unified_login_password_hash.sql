-- 2026-08-29: 통합 로그인 1단계.
-- 이메일 로그인도 app_users를 기준으로 전환하기 위해 사용자 테이블에 비밀번호 해시를 둡니다.
alter table public.app_users
  add column if not exists password_hash text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists last_auth_provider text;

alter table public.companies
  add column if not exists workspace_type text not null default 'company',
  add column if not exists owner_user_id uuid references public.app_users(id) on delete set null;

create unique index if not exists idx_app_users_email_lower
  on public.app_users (lower(email))
  where email is not null;

create index if not exists idx_company_members_user_status
  on public.company_members(user_id, status);

create index if not exists idx_company_members_company_status_role
  on public.company_members(company_id, status, role);
