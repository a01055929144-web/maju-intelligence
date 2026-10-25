-- 운영 적용 완료(2026-10-26). 재실행 금지.
-- WO-1 전체 매장 DB 1단계: 기존 데이터 변경·백필 없음.

begin;

create table if not exists public.shared_business_places (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_record_key text not null,
  dataset_type text not null,
  business_name text not null,
  road_address text,
  lot_address text,
  administrative_area text,
  administrative_subarea text,
  latitude numeric,
  longitude numeric,
  industry_raw text,
  industry_primary text,
  lead_type text not null default 'restaurant',
  permit_date date,
  open_date date,
  close_date date,
  permit_status text,
  is_active boolean not null default true,
  public_phone text,
  area_m2 numeric,
  homepage_url text,
  canonical_fingerprint text,
  source_modified_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_business_places_source_key_uq unique (source, source_record_key),
  constraint shared_business_places_source_not_blank check (btrim(source) <> ''),
  constraint shared_business_places_source_record_key_not_blank check (btrim(source_record_key) <> ''),
  constraint shared_business_places_dataset_type_check check (
    dataset_type in ('general_restaurant', 'rest_cafe', 'bakery', 'group_meal_facility', 'contract_catering')
  ),
  constraint shared_business_places_lead_type_check check (lead_type in ('restaurant', 'meal_service')),
  constraint shared_business_places_area_nonnegative check (area_m2 is null or area_m2 >= 0)
);

create index if not exists shared_business_places_area_date_idx
  on public.shared_business_places(administrative_area, dataset_type, open_date desc)
  where is_active = true;

create index if not exists shared_business_places_subarea_date_idx
  on public.shared_business_places(administrative_subarea, dataset_type, open_date desc)
  where is_active = true and administrative_subarea is not null;

create index if not exists shared_business_places_fingerprint_idx
  on public.shared_business_places(canonical_fingerprint)
  where canonical_fingerprint is not null;

create index if not exists shared_business_places_modified_idx
  on public.shared_business_places(dataset_type, source_modified_at desc nulls last);

alter table public.business_permit_leads
  add column if not exists shared_place_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_permit_leads'::regclass
      and conname = 'business_permit_leads_shared_place_fkey'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_shared_place_fkey
      foreign key (shared_place_id)
      references public.shared_business_places(id)
      on delete set null;
  end if;
end $$;

create index if not exists business_permit_leads_company_shared_place_idx
  on public.business_permit_leads(company_id, shared_place_id)
  where shared_place_id is not null and merged_into_lead_id is null;

alter table public.shared_business_places enable row level security;
revoke all on table public.shared_business_places from public, anon, authenticated;
grant all on table public.shared_business_places to service_role;

comment on table public.shared_business_places is
  '회사 공용 공공 인허가 원장. 직원 입력·영업 상태·메모·회사별 연락처는 저장하지 않는다.';
comment on column public.shared_business_places.public_phone is
  '공공데이터 원문 전화만 저장. 직원이 입력한 연락처는 회사 리드에만 둔다.';
comment on column public.shared_business_places.raw_payload is
  '공공데이터 응답 중 공유 허용 필드만 저장. 회사별 영업 데이터는 금지.';

commit;

-- 롤백(운영 적용 후 별도 승인 필요):
-- begin;
-- drop index if exists public.business_permit_leads_company_shared_place_idx;
-- alter table public.business_permit_leads drop constraint if exists business_permit_leads_shared_place_fkey;
-- alter table public.business_permit_leads drop column if exists shared_place_id;
-- drop table if exists public.shared_business_places;
-- commit;
