create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  owner_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text unique,
  name text not null,
  role text not null default 'customer_member',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  role text not null default 'member',
  invited_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid references public.app_users(id) on delete set null,
  original_filename text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists public.customer_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  source text not null default 'excel',
  row_count integer not null default 0,
  status text not null default 'completed',
  quality_score integer not null default 0,
  duplicate_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.column_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  source_header text not null,
  target_field text not null,
  confidence integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_customer_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.normalized_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  customer_name text not null,
  business_registration_number text,
  representative_name text,
  opening_date date,
  region text,
  address text,
  phone text,
  email text,
  birth_date date,
  industry text,
  monthly_revenue numeric not null default 0,
  last_order_days integer not null default 0,
  visit_count integer not null default 0,
  delivery_km numeric not null default 0,
  business_status text,
  business_status_checked_at timestamptz,
  business_license_file_url text,
  bank_account_file_url text,
  normalized_key text not null,
  duplicate_of uuid references public.normalized_customers(id) on delete set null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  health_score integer not null default 0,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.health_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  total integer not null,
  sales_power integer not null,
  delivery_efficiency integer not null,
  crm_management integer not null,
  new_sales integer not null,
  concentration integer not null,
  risk integer not null,
  formula_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create table if not exists public.lead_recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  name text not null,
  region text,
  score integer not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'this-week',
  created_at timestamptz not null default now()
);

create table if not exists public.visit_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.lead_recommendations(id) on delete set null,
  result text not null,
  memo text,
  next_action text,
  expected_revenue numeric,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_members_company on public.company_members(company_id);
create index if not exists idx_uploaded_files_company_created on public.uploaded_files(company_id, created_at desc);
create index if not exists idx_customer_imports_company_created on public.customer_imports(company_id, created_at desc);
create index if not exists idx_column_mappings_import on public.column_mappings(import_id);
create index if not exists idx_raw_customer_rows_import on public.raw_customer_rows(import_id);
create index if not exists idx_normalized_customers_company_key on public.normalized_customers(company_id, normalized_key);
create unique index if not exists idx_normalized_customers_company_key_unique on public.normalized_customers(company_id, normalized_key);
create index if not exists idx_sales_transactions_company_date on public.sales_transactions(company_id, sales_date desc);
create index if not exists idx_sales_transactions_customer_key on public.sales_transactions(company_id, customer_key);
create index if not exists idx_ai_reports_company_created on public.ai_reports(company_id, created_at desc);
create index if not exists idx_health_score_snapshots_company_created on public.health_score_snapshots(company_id, created_at desc);
create index if not exists idx_lead_recommendations_score on public.lead_recommendations(score desc);
create index if not exists idx_visit_results_company_visited on public.visit_results(company_id, visited_at desc);
create index if not exists idx_admin_audit_logs_company_created on public.admin_audit_logs(company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.app_users enable row level security;
alter table public.company_members enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.customer_imports enable row level security;
alter table public.column_mappings enable row level security;
alter table public.raw_customer_rows enable row level security;
alter table public.normalized_customers enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.ai_reports enable row level security;
alter table public.health_score_snapshots enable row level security;
alter table public.lead_recommendations enable row level security;
alter table public.visit_results enable row level security;
alter table public.admin_audit_logs enable row level security;
