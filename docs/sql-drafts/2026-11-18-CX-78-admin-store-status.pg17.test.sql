\set ON_ERROR_STOP on
do $$ begin
  assert current_database() = 'cx78_admin_store_status_test';
  assert current_setting('server_version_num')::int / 10000 = 17;
end $$;

create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.companies(id uuid primary key);
create table public.app_users(id uuid primary key);
create table public.store_profiles(
  id uuid primary key,
  status text not null check(status in ('active','suspended','closed')),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.store_accounts(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  store_profile_id uuid references public.store_profiles(id),
  unique(company_id, store_profile_id)
);
create table public.admin_audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id),
  company_id uuid references public.companies(id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

\ir 2026-11-18-CX-78-admin-store-status.sql

do $$ begin
  assert not has_function_privilege(
    'anon',
    'public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)',
    'execute'
  );
  assert not has_function_privilege(
    'authenticated',
    'public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)',
    'execute'
  );
  assert has_function_privilege(
    'service_role',
    'public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)',
    'execute'
  );
end $$;

insert into companies values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into app_users values ('00000000-0000-4000-8000-000000000010');
insert into store_profiles values
  ('00000000-0000-4000-8000-000000000101','active'),
  ('00000000-0000-4000-8000-000000000102','active'),
  ('00000000-0000-4000-8000-000000000103','closed');
insert into store_accounts values
  ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103');

select public.admin_set_store_profile_status_v1(
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
  'suspended','request-000000000001','00000000-0000-4000-8000-000000000010','대표 관리자');
select public.admin_set_store_profile_status_v1(
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
  'suspended','request-000000000001','00000000-0000-4000-8000-000000000010','대표 관리자');
do $$ begin
  assert (select status from store_profiles where id='00000000-0000-4000-8000-000000000101')='suspended';
  assert (select count(*) from admin_audit_logs where metadata->>'requestKey'='request-000000000001')=1;
  assert (select metadata->>'beforeStatus' from admin_audit_logs where metadata->>'requestKey'='request-000000000001')='active';
end $$;

do $$ begin
  begin perform public.admin_set_store_profile_status_v1(
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000102',
    'suspended','request-000000000002',null,'대표 관리자');
    raise exception 'foreign company store accepted';
  exception when raise_exception then assert sqlerrm='admin_store_profile_not_found'; end;
  assert (select status from store_profiles where id='00000000-0000-4000-8000-000000000102')='active';
end $$;

do $$ begin
  begin perform public.admin_set_store_profile_status_v1(
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000103',
    'active','request-000000000003',null,'대표 관리자');
    raise exception 'closed store resumed';
  exception when raise_exception then assert sqlerrm='admin_store_profile_closed'; end;
end $$;

do $$ begin
  begin perform public.admin_set_store_profile_status_v1(
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
    'active','request-000000000001',null,'대표 관리자');
    raise exception 'idempotency conflict accepted';
  exception when raise_exception then assert sqlerrm='admin_store_status_idempotency_conflict'; end;
end $$;

create function fail_cx78_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic_audit_failure'; end $$;
create trigger fail_cx78_audit before insert on admin_audit_logs for each row execute function fail_cx78_audit();
do $$ begin
  begin perform public.admin_set_store_profile_status_v1(
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
    'active','request-000000000004',null,'대표 관리자');
    raise exception 'audit failure did not roll back';
  exception when raise_exception then assert sqlerrm='synthetic_audit_failure'; end;
  assert (select status from store_profiles where id='00000000-0000-4000-8000-000000000101')='suspended';
end $$;
drop trigger fail_cx78_audit on admin_audit_logs;
drop function fail_cx78_audit();

select public.admin_set_store_profile_status_v1(
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101',
  'active','request-000000000005',null,'대표 관리자');
do $$ begin
  assert (select status from store_profiles where id='00000000-0000-4000-8000-000000000101')='active';
  assert (select count(*) from admin_audit_logs)=2;
end $$;

\ir 2026-11-18-CX-78-admin-store-status.down.sql
do $$ begin
  assert to_regprocedure('public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)') is null;
  assert (select count(*) from admin_audit_logs)=2;
end $$;
