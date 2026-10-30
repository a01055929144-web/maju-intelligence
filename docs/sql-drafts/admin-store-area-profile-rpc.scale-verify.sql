-- 비운영 전용 성능 재현. 빈 임시 PostgreSQL 16+ DB에서 psql -f로 실행한다.
-- 개인정보·운영 원문을 복사하지 않고 가짜 리드 22,754행과 원천 기록 1,133행을 만든다.
\set ON_ERROR_STOP on

do $preflight$
begin
  if to_regclass('public.business_permit_leads') is not null
    or to_regclass('public.business_permit_lead_source_records') is not null then
    raise exception '빈 임시 DB에서만 실행하세요';
  end if;
end
$preflight$;

begin;
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$roles$;

create table public.business_permit_leads (
  id uuid primary key,
  company_id uuid not null,
  industry_raw text,
  store_area_sqm numeric
);
create index business_permit_leads_company_idx on public.business_permit_leads(company_id);

create table public.business_permit_lead_source_records (
  id uuid primary key,
  company_id uuid not null,
  lead_id uuid not null,
  source text not null,
  source_record_key text not null,
  raw_payload jsonb,
  last_seen_at timestamptz
);
create index business_permit_lead_source_records_lead_idx
  on public.business_permit_lead_source_records(company_id, lead_id);
create unique index business_permit_lead_source_records_source_key_uq
  on public.business_permit_lead_source_records(company_id, source, source_record_key);

insert into public.business_permit_leads(id, company_id, industry_raw, store_area_sqm)
select md5('lead-' || n)::uuid,
  case when n <= 22754 then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
       else 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid end,
  (array['한식','중식','일식','카페','기타'])[(n % 5) + 1],
  case when n % 11 = 0 then null when n % 17 = 0 then 0 else (n % 300)::numeric end
from generate_series(1, 27754) n;

insert into public.business_permit_lead_source_records
  (id, company_id, lead_id, source, source_record_key, raw_payload, last_seen_at)
select md5('source-' || n)::uuid,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  md5('lead-' || ((n - 1) / 2 + 1))::uuid,
  case when n % 2 = 0 then 'seoul_opendata_api' else 'gov_restaurant_api' end,
  'source-' || n,
  jsonb_build_object('storeAreaSqm', ((n % 300) + 1)::text),
  now() - (n % 30) * interval '1 day'
from generate_series(1, 1133) n;

analyze public.business_permit_leads;
analyze public.business_permit_lead_source_records;
\ir admin-store-area-profile-rpc.sql

select count(*) as company_leads from public.business_permit_leads
where company_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select count(*) as company_source_rows from public.business_permit_lead_source_records
where company_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
explain (analyze, buffers, settings, timing off)
select public.admin_store_area_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
rollback;
