-- WO-21 draft only. Do not apply to production without explicit approval for project
-- fcmdvveqmcgtioelzqun. ACCOUNT_LOGIN_V2_ENABLED must remain false until then.
alter table public.app_users
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists session_version integer not null default 1,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists login_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_login_id_format'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_login_id_format
      check (login_id is null or (login_id = lower(login_id) and login_id ~ '^[a-z0-9_]{4,20}$'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_session_version_positive'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_session_version_positive
      check (session_version > 0);
  end if;
end $$;

create unique index if not exists app_users_login_id_unique
  on public.app_users (login_id)
  where login_id is not null;

-- The app reaches account rows only through server-side service credentials.
alter table public.app_users enable row level security;
revoke all on table public.app_users from anon, authenticated;
