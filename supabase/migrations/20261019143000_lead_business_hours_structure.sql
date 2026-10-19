-- 운영 적용 완료(2026-10-19). 재실행 금지.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_permit_leads_company_id_id_uq') then
    alter table public.business_permit_leads add constraint business_permit_leads_company_id_id_uq unique (company_id, id);
  end if;
end $$;

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
  constraint lead_business_hour_intervals_lead_fk foreign key (company_id, lead_id) references public.business_permit_leads(company_id, id) on delete cascade,
  constraint lead_business_hour_intervals_slot_uq unique (company_id, lead_id, source, weekday, interval_index)
);
create index if not exists lead_business_hour_intervals_lookup_idx on public.lead_business_hour_intervals(company_id, lead_id, weekday, source);
alter table public.lead_business_hour_intervals enable row level security;
revoke all on public.lead_business_hour_intervals from public, anon, authenticated;
