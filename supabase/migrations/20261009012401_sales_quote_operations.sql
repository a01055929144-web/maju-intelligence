-- 모바일 영업, 상품 매칭, 안전한 견적 공유, KPI, 배송 알림 재시도를 한 회사 경계 안에서 관리합니다.
-- 앱은 서버의 service role을 통해서만 접근하며 anon/authenticated 직접 접근은 차단합니다.

alter table public.companies
  add column if not exists default_quote_margin_percent numeric(5,2) not null default 12,
  add column if not exists default_quote_valid_days integer not null default 14;

alter table public.companies
  drop constraint if exists companies_default_quote_margin_percent_check,
  add constraint companies_default_quote_margin_percent_check
    check (default_quote_margin_percent between 0 and 90),
  drop constraint if exists companies_default_quote_valid_days_check,
  add constraint companies_default_quote_valid_days_check
    check (default_quote_valid_days between 1 and 365);

alter table public.lead_actions
  add column if not exists collateral_types text[] not null default '{}',
  add column if not exists follow_up_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists lead_actions_company_follow_up_idx
  on public.lead_actions (company_id, follow_up_at)
  where follow_up_at is not null;

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null default 'manual',
  source_key text,
  purchase_product_name text not null,
  purchase_spec text,
  purchase_unit text not null default 'EA',
  purchase_price numeric(14,2) not null default 0,
  sales_product_name text,
  sales_spec text,
  sales_unit text,
  default_sales_price numeric(14,2),
  photo_url text,
  match_status text not null default 'matched'
    check (match_status in ('matched', 'unmatched', 'requested', 'inactive')),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source, source_key)
);

create index if not exists product_catalog_company_status_idx
  on public.product_catalog (company_id, match_status, updated_at desc);
create index if not exists product_catalog_company_name_idx
  on public.product_catalog (company_id, purchase_product_name);

create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.business_permit_leads(id) on delete set null,
  customer_id uuid references public.normalized_customers(id) on delete set null,
  quote_number text not null,
  title text not null default '식자재 납품 견적서',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  default_margin_percent numeric(5,2) not null default 12,
  valid_until timestamptz not null,
  public_token uuid not null default gen_random_uuid(),
  public_enabled boolean not null default false,
  recipient_name text,
  recipient_phone text,
  memo text,
  created_by_name text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quote_number),
  unique (public_token),
  check (default_margin_percent between 0 and 90),
  check (lead_id is not null or customer_id is not null)
);

create index if not exists sales_quotes_company_status_idx
  on public.sales_quotes (company_id, status, updated_at desc);
create index if not exists sales_quotes_public_lookup_idx
  on public.sales_quotes (public_token, valid_until)
  where public_enabled = true;

create table if not exists public.sales_quote_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  product_catalog_id uuid references public.product_catalog(id) on delete set null,
  sort_order integer not null default 0,
  product_name text not null,
  specification text,
  unit text not null default 'EA',
  quantity numeric(12,3) not null default 1,
  purchase_unit_price numeric(14,2) not null default 0,
  sales_unit_price numeric(14,2) not null default 0,
  margin_percent numeric(5,2) not null default 12,
  photo_url text,
  is_custom_request boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity > 0),
  check (purchase_unit_price >= 0 and sales_unit_price >= 0),
  check (margin_percent between 0 and 90)
);

create index if not exists sales_quote_items_quote_idx
  on public.sales_quote_items (quote_id, sort_order, created_at);

create table if not exists public.sales_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_user_id text,
  staff_name text,
  period_month date not null,
  target_contacts integer not null default 0,
  target_quotes integer not null default 0,
  target_conversions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, staff_user_id, period_month),
  check (target_contacts >= 0 and target_quotes >= 0 and target_conversions >= 0)
);

create index if not exists sales_kpi_targets_company_month_idx
  on public.sales_kpi_targets (company_id, period_month desc);

create table if not exists public.delivery_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  completion_note_id uuid references public.customer_notes(id) on delete set null,
  channel text not null check (channel in ('sms', 'kakao', 'manual')),
  recipient text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, completion_note_id, channel),
  check (attempt_count >= 0)
);

create index if not exists delivery_notification_jobs_retry_idx
  on public.delivery_notification_jobs (company_id, status, updated_at desc)
  where status in ('pending', 'failed');

alter table public.product_catalog enable row level security;
alter table public.sales_quotes enable row level security;
alter table public.sales_quote_items enable row level security;
alter table public.sales_kpi_targets enable row level security;
alter table public.delivery_notification_jobs enable row level security;

revoke all on table public.product_catalog from anon, authenticated;
revoke all on table public.sales_quotes from anon, authenticated;
revoke all on table public.sales_quote_items from anon, authenticated;
revoke all on table public.sales_kpi_targets from anon, authenticated;
revoke all on table public.delivery_notification_jobs from anon, authenticated;

grant all on table public.product_catalog to service_role;
grant all on table public.sales_quotes to service_role;
grant all on table public.sales_quote_items to service_role;
grant all on table public.sales_kpi_targets to service_role;
grant all on table public.delivery_notification_jobs to service_role;
