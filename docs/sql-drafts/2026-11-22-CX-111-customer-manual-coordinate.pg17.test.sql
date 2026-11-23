\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then raise exception 'PostgreSQL 17 required'; end if;
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.companies(id uuid primary key);
create table public.app_users(id uuid primary key);
create table public.normalized_customers(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  customer_name text not null,
  latitude double precision,
  longitude double precision,
  geocode_accuracy text,
  geocoded_at timestamptz,
  geocoded_address text,
  updated_at timestamptz not null default now(),
  constraint coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint latitude_korea check (latitude is null or latitude between 33 and 39),
  constraint longitude_korea check (longitude is null or longitude between 124 and 132),
  constraint accuracy check (geocode_accuracy is null or geocode_accuracy in ('exact', 'approx', 'manual', 'lead'))
);
create table public.admin_audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id),
  company_id uuid references public.companies(id),
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant select, update on public.normalized_customers to service_role;
grant select, insert on public.admin_audit_logs to service_role;

\ir 2026-11-22-CX-111-customer-manual-coordinate.sql

insert into public.companies values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.app_users values ('20000000-0000-4000-8000-000000000001');
insert into public.normalized_customers(id, company_id, customer_name, latitude, longitude, geocode_accuracy, geocoded_at)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '합성 매장 A', 37.4, 126.9, 'exact', now()),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '합성 매장 B', 37.6, 127.1, 'exact', now());

do $$
declare result jsonb;
begin
  if has_function_privilege('anon', 'public.set_customer_manual_coordinate_atomic(uuid,uuid,double precision,double precision,uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.set_customer_manual_coordinate_atomic(uuid,uuid,double precision,double precision,uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.set_customer_manual_coordinate_atomic(uuid,uuid,double precision,double precision,uuid,text,text)', 'execute')
    then raise exception 'manual_coordinate_rpc_permission_failed'; end if;

  result := public.set_customer_manual_coordinate_atomic(
    '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    37.501, 127.001, '20000000-0000-4000-8000-000000000001', '합성 담당자', 'request-1');
  if result->>'geocodeAccuracy' <> 'manual'
    or (select geocode_accuracy from public.normalized_customers where id = '30000000-0000-4000-8000-000000000001') <> 'manual'
    or (select count(*) from public.admin_audit_logs where action = 'customer_manual_coordinate_changed') <> 1
    then raise exception 'manual_coordinate_or_audit_missing'; end if;

  perform public.set_customer_manual_coordinate_atomic(
    '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
    37.8, 127.8, '20000000-0000-4000-8000-000000000001', '합성 담당자', 'request-1');
  if (select latitude from public.normalized_customers where id = '30000000-0000-4000-8000-000000000001') <> 37.501
    or (select count(*) from public.admin_audit_logs where metadata->>'requestKey' = 'request-1') <> 1
    then raise exception 'manual_coordinate_idempotency_failed'; end if;

  begin
    perform public.set_customer_manual_coordinate_atomic(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
      37.7, 127.2, null, '합성 담당자', 'wrong-company');
    raise exception 'wrong_company_was_allowed';
  exception when others then
    if sqlerrm <> 'customer_not_found' then raise; end if;
  end;
end $$;

create function public.fail_manual_coordinate_audit() returns trigger language plpgsql as $$ begin
  if new.metadata->>'requestKey' = 'fail-audit' then raise exception 'synthetic_audit_failure'; end if;
  return new;
end $$;
create trigger fail_manual_coordinate_audit before insert on public.admin_audit_logs
  for each row execute function public.fail_manual_coordinate_audit();

do $$
declare before_lat double precision;
begin
  select latitude into before_lat from public.normalized_customers where id = '30000000-0000-4000-8000-000000000001';
  begin
    perform public.set_customer_manual_coordinate_atomic(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      37.9, 127.9, null, '합성 담당자', 'fail-audit');
    raise exception 'audit_failure_did_not_abort';
  exception when others then
    if sqlerrm <> 'synthetic_audit_failure' then raise; end if;
  end;
  if (select latitude from public.normalized_customers where id = '30000000-0000-4000-8000-000000000001') <> before_lat
    or exists(select 1 from public.admin_audit_logs where metadata->>'requestKey' = 'fail-audit')
    then raise exception 'audit_failure_did_not_roll_back_coordinate'; end if;
end $$;

drop trigger fail_manual_coordinate_audit on public.admin_audit_logs;
drop function public.fail_manual_coordinate_audit();
\ir 2026-11-22-CX-111-customer-manual-coordinate.down.sql
do $$ begin
  if to_regprocedure('public.set_customer_manual_coordinate_atomic(uuid,uuid,double precision,double precision,uuid,text,text)') is not null
    then raise exception 'manual_coordinate_down_incomplete'; end if;
end $$;
drop table public.admin_audit_logs, public.normalized_customers, public.app_users, public.companies;
