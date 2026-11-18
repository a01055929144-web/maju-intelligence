-- CX-126 거래처 공통 등록 · 개업 준비. REVIEW ONLY. DO NOT EXECUTE.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.normalized_customers
  add column if not exists expected_opening_date date,
  add column if not exists tax_invoice_email text;

alter table public.normalized_customers drop constraint if exists normalized_customers_tax_invoice_email_check;
alter table public.normalized_customers add constraint normalized_customers_tax_invoice_email_check
  check (tax_invoice_email is null or (length(tax_invoice_email) between 3 and 254 and tax_invoice_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

alter table public.product_suppliers
  add column if not exists address text,
  add column if not exists address_detail text,
  add column if not exists business_status text not null default 'active',
  add column if not exists business_status_checked_at timestamptz,
  add column if not exists business_entity_type text,
  add column if not exists tax_invoice_email text,
  add column if not exists business_license_file_url text,
  add column if not exists expected_opening_date date;

alter table public.product_suppliers drop constraint if exists product_suppliers_business_status_check;
alter table public.product_suppliers add constraint product_suppliers_business_status_check
  check (business_status in ('active','registration_pending','suspended','closed'));
alter table public.product_suppliers drop constraint if exists product_suppliers_business_entity_type_check;
alter table public.product_suppliers add constraint product_suppliers_business_entity_type_check
  check (business_entity_type is null or business_entity_type in ('individual','corporation'));
alter table public.product_suppliers drop constraint if exists product_suppliers_registration_pending_check;
-- Existing active suppliers predate the entity/email columns and must remain writable.
-- Required fields for newly confirmed suppliers are enforced by the registration API.
alter table public.product_suppliers drop constraint if exists product_suppliers_tax_invoice_email_check;
alter table public.product_suppliers add constraint product_suppliers_tax_invoice_email_check
  check (tax_invoice_email is null or (length(tax_invoice_email) between 3 and 254 and tax_invoice_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

create table if not exists public.business_partner_registration_events (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  partner_type text not null check (partner_type in ('customer','supplier')), partner_id uuid not null,
  action text not null check (action in ('created','business_number_verified','status_changed','existing_linked')),
  before_values jsonb not null default '{}'::jsonb, after_values jsonb not null default '{}'::jsonb,
  actor_key text, created_at timestamptz not null default now()
);
create index if not exists business_partner_registration_events_lookup_idx on public.business_partner_registration_events(company_id,partner_type,partner_id,created_at desc);
alter table public.business_partner_registration_events enable row level security;
revoke all on public.business_partner_registration_events from public, anon, authenticated;
grant all on public.business_partner_registration_events to service_role;

commit;
