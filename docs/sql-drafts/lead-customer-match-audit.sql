-- 운영 적용 완료(2026-10-19). 재실행 금지.
-- 기록본: supabase/migrations/20261019090000_lead_customer_match_audit.sql
begin;

alter table public.business_permit_leads
  add column if not exists matched_customer_at timestamptz,
  add column if not exists matched_customer_method text,
  add column if not exists matched_customer_confidence integer;

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_match_method_check,
  add constraint business_permit_leads_match_method_check
    check (matched_customer_method is null or matched_customer_method in ('business_number','name_address','manual','conversion'));

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_match_confidence_check,
  add constraint business_permit_leads_match_confidence_check
    check (matched_customer_confidence is null or matched_customer_confidence between 0 and 100);

create index if not exists business_permit_leads_match_audit_idx
  on public.business_permit_leads(company_id, matched_customer_at desc)
  where matched_customer_id is not null;

rollback;
