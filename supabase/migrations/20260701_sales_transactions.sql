-- Adds customer master fields and sales transaction storage for ERP Excel uploads.

alter table public.normalized_customers
  add column if not exists business_registration_number text,
  add column if not exists representative_name text,
  add column if not exists opening_date date,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists birth_date date,
  add column if not exists business_status text,
  add column if not exists business_status_checked_at timestamptz,
  add column if not exists business_license_file_url text,
  add column if not exists bank_account_file_url text;

create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  customer_key text not null,
  customer_name text not null,
  business_registration_number text,
  sales_date date,
  product_name text,
  quantity numeric,
  sales_amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_transactions_company_date
on public.sales_transactions(company_id, sales_date desc);

create index if not exists idx_sales_transactions_customer_key
on public.sales_transactions(company_id, customer_key);

alter table public.sales_transactions enable row level security;
