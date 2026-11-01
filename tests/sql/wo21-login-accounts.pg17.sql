\set ON_ERROR_STOP on

begin;

create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
drop table if exists public.app_users cascade;
create table public.app_users (
  id uuid primary key,
  name text not null,
  role text not null,
  status text not null default 'active'
);

\ir ../../supabase/migrations/20261101165122_wo21_login_accounts.sql

insert into public.app_users (id, name, role, login_id)
values ('00000000-0000-0000-0000-000000000001', '대표', 'customer_owner', 'owner_01');

do $$
begin
  begin
    insert into public.app_users (id, name, role, login_id)
    values ('00000000-0000-0000-0000-000000000002', '중복', 'customer_member', 'owner_01');
    raise exception 'duplicate login_id accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.app_users (id, name, role, login_id)
    values ('00000000-0000-0000-0000-000000000003', '잘못된 형식', 'customer_member', 'Owner-01');
    raise exception 'invalid login_id accepted';
  exception when check_violation then null;
  end;

  update public.app_users
    set session_version = session_version + 1,
        must_change_password = true
    where login_id = 'owner_01';

  if not exists (
    select 1 from public.app_users
    where login_id = 'owner_01' and session_version = 2 and must_change_password
  ) then
    raise exception 'session invalidation state was not persisted';
  end if;

  if has_table_privilege('anon', 'public.app_users', 'select')
     or has_table_privilege('authenticated', 'public.app_users', 'select') then
    raise exception 'direct Data API roles can read app_users';
  end if;
end $$;

rollback;
