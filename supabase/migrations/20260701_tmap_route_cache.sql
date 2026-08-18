-- Stores Tmap route distance/time/path results from company origin to customer destination.

alter table public.companies
  add column if not exists origin_address text,
  add column if not exists origin_lat numeric,
  add column if not exists origin_lng numeric;

alter table public.normalized_customers
  add column if not exists delivery_minutes integer,
  add column if not exists route_calculated_at timestamptz;

create table if not exists public.route_distance_cache (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.normalized_customers(id) on delete cascade,
  origin_address text not null,
  destination_address text not null,
  origin_lat numeric,
  origin_lng numeric,
  destination_lat numeric,
  destination_lng numeric,
  distance_km numeric not null default 0,
  duration_minutes integer not null default 0,
  provider text not null default 'tmap',
  route_geometry jsonb,
  raw_response jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_route_distance_cache_company_destination
on public.route_distance_cache(company_id, destination_address);

create index if not exists idx_route_distance_cache_company_calculated
on public.route_distance_cache(company_id, calculated_at desc);

alter table public.route_distance_cache enable row level security;
