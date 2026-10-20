-- 운영 적용 완료(2026-10-20). 재실행 금지.
-- 리드 중복 방지 1단계: 원천 식별자와 교차 출처 canonical fingerprint 저장 구조.
-- 적용 순서: 이 파일 승인·적용 -> 앱 적재 전환 -> 정리 dry-run 승인 -> 병합 -> UNIQUE 인덱스 생성.

begin;

alter table public.business_permit_leads
  add column if not exists canonical_fingerprint text,
  add column if not exists source_list text[] not null default '{}'::text[];

create index if not exists business_permit_leads_company_fingerprint_idx
  on public.business_permit_leads(company_id, canonical_fingerprint)
  where canonical_fingerprint is not null;

create table if not exists public.business_permit_lead_source_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  source text not null,
  source_record_key text not null,
  permit_status text,
  permit_date date,
  open_date date,
  phone text,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint business_permit_lead_source_records_company_fkey
    foreign key (company_id) references public.companies(id) on delete cascade,
  constraint business_permit_lead_source_records_lead_fkey
    foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade,
  constraint business_permit_lead_source_records_source_key_uq
    unique (company_id, source, source_record_key)
);

create index if not exists business_permit_lead_source_records_lead_idx
  on public.business_permit_lead_source_records(company_id, lead_id);

alter table public.business_permit_lead_source_records enable row level security;
revoke all on table public.business_permit_lead_source_records from public, anon, authenticated;
grant all on table public.business_permit_lead_source_records to service_role;

commit;

-- 병합 승인·실행 뒤에만 별도 마이그레이션으로 생성:
-- create unique index business_permit_leads_company_fingerprint_uq
--   on public.business_permit_leads(company_id, canonical_fingerprint)
--   where canonical_fingerprint is not null;

-- rollback (앱 전환 전만):
-- begin;
-- drop table if exists public.business_permit_lead_source_records;
-- drop index if exists public.business_permit_leads_company_fingerprint_idx;
-- alter table public.business_permit_leads
--   drop column if exists source_list,
--   drop column if exists canonical_fingerprint;
-- commit;
