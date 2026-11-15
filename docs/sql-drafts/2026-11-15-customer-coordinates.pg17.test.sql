-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on

do $$ begin
  if current_setting('server_version_num')::int not between 170000 and 179999 then
    raise exception 'PostgreSQL 17 required';
  end if;
end $$;

create extension if not exists pgcrypto;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create table public.normalized_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_name text not null
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  company_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.normalized_customers enable row level security;
create policy normalized_customers_company_scope on public.normalized_customers
  for all to authenticated
  using (company_id::text = current_setting('app.company_id', true))
  with check (company_id::text = current_setting('app.company_id', true));

insert into public.normalized_customers(id, company_id, customer_name) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '가짜 거래처');

create temporary table policy_before as
select polname, polcmd, polroles, polqual::text, polwithcheck::text
from pg_policy
where polrelid = 'public.normalized_customers'::regclass;
create temporary table acl_before as
select relacl::text
from pg_class
where oid = 'public.normalized_customers'::regclass;

\ir 2026-11-15-customer-coordinates.sql

do $$ begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'normalized_customers'
        and column_name in ('latitude', 'longitude', 'geocode_accuracy', 'geocoded_at', 'geocoded_address')) <> 5
    or exists (
      select 1 from public.normalized_customers
      where num_nonnulls(latitude, longitude, geocode_accuracy, geocoded_at, geocoded_address) <> 0
    )
    or not (select relrowsecurity from pg_class where oid = 'public.normalized_customers'::regclass)
    or exists (
      (select polname, polcmd, polroles, polqual, polwithcheck from policy_before
       except
       select polname, polcmd, polroles, polqual::text, polwithcheck::text from pg_policy
       where polrelid = 'public.normalized_customers'::regclass)
      union all
      (select polname, polcmd, polroles, polqual::text, polwithcheck::text from pg_policy
       where polrelid = 'public.normalized_customers'::regclass
       except
       select polname, polcmd, polroles, polqual, polwithcheck from policy_before)
    )
    or (select relacl::text from pg_class where oid = 'public.normalized_customers'::regclass)
       is distinct from (select relacl from acl_before)
    or not exists (
      select 1 from public.admin_audit_logs
      where action = 'customer_coordinates_schema_added'
        and metadata @> '{"backfilled_rows": 0}'::jsonb
    ) then
    raise exception 'customer_coordinates_schema_contract_failed';
  end if;
end $$;

update public.normalized_customers
set latitude = 37.5, longitude = 127.0, geocode_accuracy = 'exact',
    geocoded_at = clock_timestamp(), geocoded_address = '서울 가짜구 테스트로 1';

do $$ begin
  begin
    update public.normalized_customers set latitude = 32.9;
    raise exception 'invalid_latitude_accepted';
  exception when check_violation then null; end;
  begin
    update public.normalized_customers set geocode_accuracy = 'unknown';
    raise exception 'invalid_accuracy_accepted';
  exception when check_violation then null; end;
  begin
    update public.normalized_customers set longitude = null;
    raise exception 'partial_coordinate_accepted';
  exception when check_violation then null; end;
end $$;

update public.normalized_customers
set latitude = null, longitude = null, geocode_accuracy = null, geocoded_at = null, geocoded_address = null;

\ir 2026-11-15-customer-coordinates.down.sql

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'normalized_customers'
      and column_name in ('latitude', 'longitude', 'geocode_accuracy', 'geocoded_at', 'geocoded_address')
  )
    or (select count(*) from public.normalized_customers) <> 1
    or not exists (
      select 1 from public.admin_audit_logs where action = 'customer_coordinates_schema_removed'
    ) then
    raise exception 'customer_coordinates_down_contract_failed';
  end if;
end $$;

select 'customer coordinates PG17 checks passed' as result;
