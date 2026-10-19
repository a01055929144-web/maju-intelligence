alter table public.business_permit_leads
  add column if not exists administrative_subarea text;

create index if not exists business_permit_leads_company_administrative_subarea_idx
  on public.business_permit_leads (company_id, administrative_subarea)
  where administrative_subarea is not null;
