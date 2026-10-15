-- Product supplier business profile draft, 2026-10-16.
-- REVIEW ONLY. DO NOT EXECUTE. Existing supplier/product/cost data is unchanged.

begin;

alter table public.product_suppliers
  add column if not exists business_number text,
  add column if not exists representative_name text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists payment_terms text,
  add column if not exists memo text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_suppliers_business_number_check') then
    alter table public.product_suppliers add constraint product_suppliers_business_number_check
      check (business_number is null or business_number ~ '^[0-9]{10}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='product_suppliers_contact_email_check') then
    alter table public.product_suppliers add constraint product_suppliers_contact_email_check
      check (contact_email is null or length(contact_email) <= 254);
  end if;
  if not exists (select 1 from pg_constraint where conname='product_suppliers_profile_lengths_check') then
    alter table public.product_suppliers add constraint product_suppliers_profile_lengths_check check (
      (representative_name is null or length(representative_name) <= 100)
      and (contact_name is null or length(contact_name) <= 100)
      and (contact_phone is null or length(contact_phone) <= 30)
      and (payment_terms is null or length(payment_terms) <= 500)
      and (memo is null or length(memo) <= 4000)
    );
  end if;
end $$;

create unique index if not exists product_suppliers_company_business_number_uq
  on public.product_suppliers(company_id,business_number)
  where business_number is not null and business_number<>'';

-- Existing table already has RLS enabled. Keep server-only access explicit.
alter table public.product_suppliers enable row level security;
revoke all on public.product_suppliers from public,anon,authenticated;
grant all on public.product_suppliers to service_role;

commit;

-- Rollback draft (only before UI/API starts storing profile values):
-- drop index if exists public.product_suppliers_company_business_number_uq;
-- alter table public.product_suppliers drop constraint if exists product_suppliers_business_number_check;
-- alter table public.product_suppliers drop constraint if exists product_suppliers_contact_email_check;
-- alter table public.product_suppliers drop constraint if exists product_suppliers_profile_lengths_check;
-- alter table public.product_suppliers drop column if exists business_number,
--   drop column if exists representative_name, drop column if exists contact_name,
--   drop column if exists contact_phone, drop column if exists contact_email,
--   drop column if exists payment_terms, drop column if exists memo;
