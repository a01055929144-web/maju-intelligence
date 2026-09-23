create table if not exists public.delivery_route_follow_ups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_date date not null,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  status text not null check (status in ('redelivery', 'cancelled', 'checked')),
  processed_by_user_id uuid references public.app_users(id) on delete set null,
  processed_by_name text not null,
  processed_by_role text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_route_follow_ups_company_date_customer_unique unique (company_id, route_date, customer_id)
);

create index if not exists idx_delivery_route_follow_ups_company_date
  on public.delivery_route_follow_ups(company_id, route_date desc);

alter table public.delivery_route_follow_ups enable row level security;
