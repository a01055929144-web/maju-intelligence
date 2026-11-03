-- 11/3 ID 로그인 전환 (대표 결정). 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요.
-- 비밀번호 값은 넣지 않는다. 대표가 화면에서 직접 설정한다.
begin;

-- 1) WO-21 로그인 계정 컬럼 (docs/sql-drafts/20261101165122_wo21_login_accounts.sql 과 동일)
alter table public.app_users
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists session_version integer not null default 1,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists login_locked_until timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_login_id_format' and conrelid = 'public.app_users'::regclass) then
    alter table public.app_users add constraint app_users_login_id_format
      check (login_id is null or (login_id = lower(login_id) and login_id ~ '^[a-z0-9_]{4,20}$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_users_session_version_positive' and conrelid = 'public.app_users'::regclass) then
    alter table public.app_users add constraint app_users_session_version_positive check (session_version > 0);
  end if;
end $$;

create unique index if not exists app_users_login_id_unique on public.app_users (login_id) where login_id is not null;
alter table public.app_users enable row level security;
revoke all on table public.app_users from anon, authenticated;

-- 2) 운영 계정(마주식자재 대표, 이메일 로그인 사용자)의 아이디를 admin 으로 지정. 기존 비밀번호는 유지.
update public.app_users set login_id = 'admin', session_version = session_version + 1
 where id = '5681adcd-d19e-48ed-984b-5548a59081f4';

commit;
-- 관리자 maju_admin 은 SQL로 만들지 않는다: 플래그 ON 후 기존 관리자 로그인 → /admin/accounts 에서 대표가 직접 생성.
