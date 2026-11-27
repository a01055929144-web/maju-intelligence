\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role noinherit; end if;
end $$;

create table public.companies(id uuid primary key);
create table public.company_lead_search_regions(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  label text not null,
  area_kind text not null default 'assigned'
);
create table public.delivery_territories(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, id),
  unique(company_id, name)
);
create table public.delivery_territory_areas(
  company_id uuid not null,
  territory_id uuid not null,
  administrative_area text not null,
  created_at timestamptz not null default now(),
  primary key(company_id, administrative_area),
  foreign key(company_id, territory_id) references public.delivery_territories(company_id, id) on delete cascade
);

insert into public.companies values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.company_lead_search_regions(company_id, label) values
  ('00000000-0000-4000-8000-000000000001', '서울특별시 강남구'),
  ('00000000-0000-4000-8000-000000000001', '서울특별시 송파구'),
  ('00000000-0000-4000-8000-000000000001', '서울특별시 마포구'),
  ('00000000-0000-4000-8000-000000000002', '부산광역시 해운대구');
insert into public.delivery_territories(id, company_id, name) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '기존 배송 권역');
insert into public.delivery_territory_areas(company_id, territory_id, administrative_area) values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '서울특별시 송파구');

\ir ../../docs/sql-drafts/2026-11-27-CX-151-sales-area-delivery-sync.sql

select public.sync_sales_areas_to_default_delivery_territory_v1('00000000-0000-4000-8000-000000000001');
select public.sync_sales_areas_to_default_delivery_territory_v1('00000000-0000-4000-8000-000000000001');

do $$
declare
  v_status jsonb;
begin
  v_status := public.sales_area_delivery_sync_status_v1('00000000-0000-4000-8000-000000000001');
  if v_status->'conflictAreas' <> '["서울특별시 송파구"]'::jsonb then raise exception 'cx151_conflict_not_reported: %', v_status; end if;
  if jsonb_array_length(v_status->'syncedAreas') <> 2 then raise exception 'cx151_default_area_count_wrong: %', v_status; end if;
  if exists(select 1 from public.delivery_territory_areas where company_id='00000000-0000-4000-8000-000000000002') then raise exception 'cx151_company_boundary_broken'; end if;
  if (select count(*) from public.delivery_territories where company_id='00000000-0000-4000-8000-000000000001' and name='기본 배송 권역(영업 지역)') <> 1 then raise exception 'cx151_not_idempotent'; end if;
end $$;

select public.set_sales_area_delivery_disabled_v1(
  '00000000-0000-4000-8000-000000000001',
  (select id from public.company_lead_search_regions where label='서울특별시 강남구'),
  true
);

do $$
begin
  if exists(select 1 from public.delivery_territory_areas where company_id='00000000-0000-4000-8000-000000000001' and administrative_area='서울특별시 강남구') then raise exception 'cx151_disabled_area_still_synced'; end if;
  if not exists(select 1 from public.company_lead_search_regions where label='서울특별시 강남구' and delivery_disabled) then raise exception 'cx151_disabled_state_missing'; end if;
end $$;

\ir ../../docs/sql-drafts/2026-11-27-CX-151-sales-area-delivery-sync.down.sql

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='company_lead_search_regions' and column_name='delivery_disabled') then raise exception 'cx151_down_column_remains'; end if;
  if to_regprocedure('public.sync_sales_areas_to_default_delivery_territory_v1(uuid)') is not null then raise exception 'cx151_down_function_remains'; end if;
  if not exists(select 1 from public.delivery_territory_areas where administrative_area='서울특별시 마포구') then raise exception 'cx151_down_removed_business_data'; end if;
end $$;
