-- REVIEW ONLY. 운영 DB에 실행하지 마세요.
-- 요일별 영업 구간과 출처를 보관합니다. 담당자 입력(manual)이 외부 API보다 우선입니다.
begin;

create table if not exists public.lead_business_hour_intervals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  interval_index smallint not null default 0 check (interval_index >= 0),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  source text not null check (source in ('manual','google_places','import')),
  source_observed_at timestamptz,
  edited_by_user_id uuid,
  edited_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_business_hour_intervals_lead_fk foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade,
  constraint lead_business_hour_intervals_slot_uq unique (company_id, lead_id, source, weekday, interval_index)
);

create index if not exists lead_business_hour_intervals_lookup_idx
  on public.lead_business_hour_intervals(company_id, lead_id, weekday, source);

alter table public.lead_business_hour_intervals enable row level security;
revoke all on public.lead_business_hour_intervals from public, anon, authenticated;

-- 읽기 모델은 lead/day별 manual 행이 있으면 manual만, 없으면 최신 google_places/import를 선택합니다.
-- 같은 요일에 두 구간이 있으면 첫 close와 둘째 open 사이를 브레이크 타임 후보로 계산하되,
-- 화면에 "추정"으로 표시하고 담당자 확인 전 자동 방문 코스의 강제 제약으로 쓰지 않습니다.

rollback;
