\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create table public.companies (id uuid primary key);
create table public.business_permit_leads (
  id uuid primary key, company_id uuid not null references public.companies(id), industry_raw text
);
create table public.business_permit_lead_source_records (
  id uuid primary key, company_id uuid not null, lead_id uuid not null,
  source text not null, last_seen_at timestamptz, raw_payload jsonb not null
);

\ir 20261102-L2-store-area.sql
\ir admin-store-area-profile-rpc.sql

insert into public.companies values
  ('04ebb7bb-8da0-4723-8211-f2a947939344'),
  ('898d85fc-c475-47e0-9943-91709e13a4bb');
insert into public.business_permit_leads(id, company_id, industry_raw) values
  ('00000000-0000-0000-0000-000000000001','04ebb7bb-8da0-4723-8211-f2a947939344','일반음식점'),
  ('00000000-0000-0000-0000-000000000002','898d85fc-c475-47e0-9943-91709e13a4bb','일반음식점');
insert into public.business_permit_lead_source_records values
  ('10000000-0000-0000-0000-000000000001','04ebb7bb-8da0-4723-8211-f2a947939344','00000000-0000-0000-0000-000000000001','gov_restaurant_api',now(),'{"storeAreaSqm":"50"}'),
  ('10000000-0000-0000-0000-000000000002','898d85fc-c475-47e0-9943-91709e13a4bb','00000000-0000-0000-0000-000000000002','gov_restaurant_api',now(),'{"storeAreaSqm":"75"}');

\ir 20261102-L2-store-area-backfill.sql
\ir 20261102-L2-store-area-backfill.sql

do $$ begin
  if (select store_area_sqm from public.business_permit_leads where id='00000000-0000-0000-0000-000000000001') <> 50 then
    raise exception 'representative company backfill failed';
  end if;
  if (select store_area_sqm from public.business_permit_leads where id='00000000-0000-0000-0000-000000000002') is not null then
    raise exception 'other company was modified';
  end if;
  if has_function_privilege('anon', 'public.admin_store_area_profile(uuid)', 'EXECUTE') then
    raise exception 'anon can execute profile';
  end if;
  if not has_function_privilege('service_role', 'public.admin_store_area_profile(uuid)', 'EXECUTE') then
    raise exception 'service_role cannot execute profile';
  end if;
  if (public.admin_store_area_profile('04ebb7bb-8da0-4723-8211-f2a947939344')->'profile'->>'positiveCount')::int <> 1 then
    raise exception 'representative company profile failed';
  end if;
  if (public.admin_store_area_profile('898d85fc-c475-47e0-9943-91709e13a4bb')->'profile'->>'positiveCount')::int <> 0 then
    raise exception 'profile company isolation failed';
  end if;
end $$;
